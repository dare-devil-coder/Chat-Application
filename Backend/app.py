import os
import threading

from flask import Flask, request, jsonify, send_from_directory
from flask_socketio import SocketIO, emit, join_room
from flask_cors import CORS
from werkzeug.exceptions import RequestEntityTooLarge
from werkzeug.security import generate_password_hash, check_password_hash

import database as db
import uploads
from exceptions import (ChatError, InvalidInputError, InvalidCredentialsError,
                        UserNotFoundError, ScheduledNotFoundError)
from models import User, Message, ScheduledMessage
from scheduler import start_scheduler
from utils import log_time, paginate, log_event, parse_future_utc

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = uploads.MAX_UPLOAD_MB * 1024 * 1024
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*")

db.init_db()

# ---- who is online (dict + set) ----
online_users = {}            # user_id -> set of socket ids (one user can have many tabs)
sid_to_user = {}             # socket id -> user_id
online_lock = threading.Lock()


@app.errorhandler(ChatError)
def handle_chat_error(err):
    log_event(f"ERROR {type(err).__name__}: {err}")
    return jsonify({"error": str(err)}), err.status_code


@app.errorhandler(RequestEntityTooLarge)
def handle_too_large(err):
    msg = f"File is too large (maximum {uploads.MAX_UPLOAD_MB} MB)"
    log_event(f"ERROR RequestEntityTooLarge: {msg}")
    return jsonify({"error": msg}), 413


# ---------------- REST API ----------------
@app.route("/api/register", methods=["POST"])
@log_time
def register():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    if len(username) < 3 or len(password) < 4:
        raise InvalidInputError("Username needs 3+ characters and password 4+")
    user_id = db.create_user(username, generate_password_hash(password))
    user = User.from_row(db.get_user_by_id(user_id))
    log_event(f"REGISTER {username}")
    return jsonify(user.to_dict()), 201


@app.route("/api/login", methods=["POST"])
@log_time
def login():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    row = db.get_user_by_username(username)
    if row is None or not check_password_hash(row["password_hash"],
                                              data.get("password") or ""):
        raise InvalidCredentialsError("Wrong username or password")
    log_event(f"LOGIN {username}")
    return jsonify(User.from_row(row).to_dict())


@app.route("/api/users", methods=["GET"])
def list_users():
    return jsonify([User.from_row(r).to_dict() for r in db.get_all_users()])


@app.route("/api/upload", methods=["POST"])
@log_time
def upload():
    file = request.files.get("file")
    if file is None or not file.filename:
        raise InvalidInputError("No file was sent")
    attachment = uploads.save_upload(file)
    log_event(f"UPLOAD {attachment['kind']} {attachment['size']} bytes")
    return jsonify(attachment), 201


@app.route("/uploads/<path:filename>", methods=["GET"])
def serve_upload(filename):
    as_attachment = request.args.get("download") == "1"
    return send_from_directory(uploads.UPLOAD_DIR, filename,
                               as_attachment=as_attachment,
                               mimetype=uploads.mimetype_for(filename),
                               download_name=filename.split("_", 1)[-1])


@app.route("/api/messages", methods=["POST"])
def create_message():
    data = request.get_json(silent=True) or {}
    file_id = data.get("file_id")
    attachment = uploads.describe(file_id) if file_id else None
    row = db.save_message(data.get("sender_id"), data.get("receiver_id"),
                          data.get("text"), attachment)
    return jsonify(Message.from_row(row).to_dict()), 201


@app.route("/api/messages/<int:user_a>/<int:user_b>", methods=["GET"])
@log_time
def history(user_a, user_b):
    try:
        size = int(request.args.get("size", 50))
        page = int(request.args.get("page", 1))
    except ValueError:
        raise InvalidInputError("page and size must be numbers")
    if size < 1 or page < 1:
        raise InvalidInputError("page and size must be at least 1")

    msgs = [Message.from_row(r).to_dict() for r in db.get_history(user_a, user_b)]
    pages = list(paginate(msgs, size))          # generator in use
    chunk = pages[page - 1] if page <= len(pages) else []
    return jsonify({"messages": chunk, "page": page, "total_pages": len(pages)})


@app.route("/api/messages/<int:message_id>", methods=["DELETE"])
def remove_message(message_id):
    if not db.delete_message(message_id):
        raise UserNotFoundError("Message not found")
    log_event(f"DELETE message {message_id}")
    return jsonify({"deleted": message_id})


# ---------------- Scheduled messages ----------------
@app.route("/api/scheduled", methods=["POST"])
@log_time
def schedule_message():
    data = request.get_json(silent=True) or {}
    send_at = parse_future_utc(data.get("send_at"))
    row = db.create_scheduled(data.get("sender_id"), data.get("receiver_id"),
                              data.get("text"), send_at)
    item = ScheduledMessage.from_row(row)
    log_event(f"SCHEDULE {item.sender_id} -> {item.receiver_id} at {item.send_at} UTC")
    return jsonify(item.to_dict()), 201


@app.route("/api/scheduled/<int:user_id>", methods=["GET"])
def list_scheduled(user_id):
    return jsonify([ScheduledMessage.from_row(r).to_dict()
                    for r in db.list_pending_scheduled(user_id)])


@app.route("/api/scheduled/<int:schedule_id>", methods=["DELETE"])
def cancel_scheduled(schedule_id):
    user_id = request.args.get("user_id", type=int)
    if user_id is None or not db.cancel_scheduled(schedule_id, user_id):
        raise ScheduledNotFoundError("Scheduled message not found or already sent")
    log_event(f"SCHEDULE CANCELLED {schedule_id}")
    return jsonify({"cancelled": schedule_id})


# ---------------- Disappearing messages ----------------
ALLOWED_TIMERS = {0, 60, 3600, 86400, 604800}    # off, 1 min, 1 hour, 24 hours, 7 days


@app.route("/api/chats/<int:user_a>/<int:user_b>/timer", methods=["GET"])
def get_chat_timer(user_a, user_b):
    return jsonify({"seconds": db.get_disappear_seconds(user_a, user_b)})


@app.route("/api/chats/<int:user_a>/<int:user_b>/timer", methods=["PUT"])
def set_chat_timer(user_a, user_b):
    data = request.get_json(silent=True) or {}
    user_id = data.get("user_id")
    seconds = data.get("seconds")
    if user_id not in (user_a, user_b):
        raise InvalidInputError("You are not part of this chat")
    if not isinstance(seconds, int) or seconds not in ALLOWED_TIMERS:
        raise InvalidInputError("Unsupported timer value")
    if db.get_user_by_id(user_a) is None or db.get_user_by_id(user_b) is None:
        raise UserNotFoundError("User does not exist")

    db.set_disappear_seconds(user_a, user_b, seconds)
    log_event(f"TIMER chat {user_a}-{user_b} set to {seconds}s by user {user_id}")
    event = {"user_a": user_a, "user_b": user_b, "seconds": seconds}
    socketio.emit("timer changed", event, to=f"user-{user_a}")
    socketio.emit("timer changed", event, to=f"user-{user_b}")
    return jsonify(event)


# ---------------- Search ----------------
@app.route("/api/search", methods=["GET"])
@log_time
def search():
    user_id = request.args.get("user_id", type=int)
    query = (request.args.get("q") or "").strip()
    other_id = request.args.get("with", type=int)          # optional: one chat only
    kind = request.args.get("kind") or None                # optional: image / video / file / audio
    limit = request.args.get("limit", default=50, type=int)

    if user_id is None:
        raise InvalidInputError("user_id is required")
    if len(query) < 2:
        raise InvalidInputError("Type at least 2 characters to search")
    if kind not in (None, "image", "video", "file", "audio"):
        raise InvalidInputError("Unknown file type filter")
    limit = max(1, min(limit, 200))

    results = []
    for row in db.search_messages(user_id, query, other_id, kind, limit):
        item = Message.from_row(row).to_dict()
        item["other_id"] = row["receiver_id"] if row["sender_id"] == user_id else row["sender_id"]
        results.append(item)
    log_event(f"SEARCH user {user_id}: {len(results)} result(s)")   # the search text is not logged
    return jsonify({"query": query, "count": len(results), "results": results})


# ---------------- Socket.IO ----------------
@socketio.on("connect")
def on_connect():
    print("a user connected")


@socketio.on("join")
def on_join(data):
    user_id = data["user_id"]
    join_room(f"user-{user_id}")
    with online_lock:
        sid_to_user[request.sid] = user_id
        online_users.setdefault(user_id, set()).add(request.sid)
        online = sorted(online_users)
    log_event(f"ONLINE user {user_id}")
    socketio.emit("presence", {"online": online})     # tell everyone


@socketio.on("private message")
def on_private_message(data):
    try:
        file_id = data.get("file_id")
        attachment = uploads.describe(file_id) if file_id else None
        row = db.save_message(data.get("sender_id"), data.get("receiver_id"),
                              data.get("text"), attachment)
    except ChatError as err:
        log_event(f"ERROR {type(err).__name__}: {err}")
        emit("error message", {"error": str(err)})
        return
    payload = Message.from_row(row).to_dict()
    extra = f" + {payload['attachment']['kind']}" if payload["attachment"] else ""
    log_event(f"MESSAGE {payload['sender_id']} -> {payload['receiver_id']} "
              f"({len(payload['text'])} chars{extra})")
    emit("private message", payload, to=f"user-{payload['receiver_id']}")
    emit("private message", payload, to=f"user-{payload['sender_id']}")


@socketio.on("disconnect")
def on_disconnect():
    with online_lock:
        user_id = sid_to_user.pop(request.sid, None)
        if user_id is not None:
            sids = online_users.get(user_id, set())
            sids.discard(request.sid)
            if not sids:                      # last tab closed -> offline
                online_users.pop(user_id, None)
                log_event(f"OFFLINE user {user_id}")
        online = sorted(online_users)
    socketio.emit("presence", {"online": online})


if __name__ == "__main__":
    # With debug=True Flask starts the app twice (a watcher process and the real
    # one). Start the background worker only in the real one, or every scheduled
    # message would be handled by two workers.
    if os.environ.get("WERKZEUG_RUN_MAIN") == "true":
        start_scheduler(socketio)
    socketio.run(app, port=5000, debug=True)
from flask import Flask, request, jsonify
from flask_socketio import SocketIO, emit, join_room
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash

import database as db
from exceptions import (ChatError, InvalidInputError, InvalidCredentialsError,
                        UserNotFoundError)
from models import User, Message
from utils import log_time, paginate

app = Flask(__name__)
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*")

db.init_db()


@app.errorhandler(ChatError)
def handle_chat_error(err):
    return jsonify({"error": str(err)}), err.status_code


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
    return jsonify(user.to_dict()), 201


@app.route("/api/login", methods=["POST"])
@log_time
def login():
    data = request.get_json(silent=True) or {}
    row = db.get_user_by_username((data.get("username") or "").strip())
    if row is None or not check_password_hash(row["password_hash"],
                                              data.get("password") or ""):
        raise InvalidCredentialsError("Wrong username or password")
    return jsonify(User.from_row(row).to_dict())


@app.route("/api/users", methods=["GET"])
def list_users():
    return jsonify([User.from_row(r).to_dict() for r in db.get_all_users()])


@app.route("/api/messages", methods=["POST"])
def create_message():
    data = request.get_json(silent=True) or {}
    row = db.save_message(data.get("sender_id"), data.get("receiver_id"),
                          data.get("text"))
    return jsonify(Message.from_row(row).to_dict()), 201


@app.route("/api/messages/<int:user_a>/<int:user_b>", methods=["GET"])
@log_time
def history(user_a, user_b):
    msgs = [Message.from_row(r).to_dict() for r in db.get_history(user_a, user_b)]
    size = int(request.args.get("size", 50))
    page = int(request.args.get("page", 1))
    pages = list(paginate(msgs, size))          # generator in use
    chunk = pages[page - 1] if 0 < page <= len(pages) else []
    return jsonify({"messages": chunk, "page": page, "total_pages": len(pages)})


@app.route("/api/messages/<int:message_id>", methods=["DELETE"])
def remove_message(message_id):
    if not db.delete_message(message_id):
        raise UserNotFoundError("Message not found")
    return jsonify({"deleted": message_id})


# ---------------- Socket.IO ----------------
@socketio.on("connect")
def on_connect():
    print("a user connected")


@socketio.on("join")
def on_join(data):
    # every user gets a private "room" named after their id
    join_room(f"user-{data['user_id']}")
    print(f"user {data['user_id']} joined their room")


@socketio.on("private message")
def on_private_message(data):
    try:
        row = db.save_message(data.get("sender_id"), data.get("receiver_id"),
                              data.get("text"))
    except ChatError as err:
        emit("error message", {"error": str(err)})
        return
    payload = Message.from_row(row).to_dict()
    # deliver to the receiver, and back to the sender (for confirmation / other tabs)
    emit("private message", payload, to=f"user-{payload['receiver_id']}")
    emit("private message", payload, to=f"user-{payload['sender_id']}")


@socketio.on("disconnect")
def on_disconnect():
    print("user disconnected")


if __name__ == "__main__":
    socketio.run(app, port=5000, debug=True)
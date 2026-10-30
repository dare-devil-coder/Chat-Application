"""Background worker that delivers scheduled messages (Experiment 7: threading).

One thread wakes up every few seconds, asks the database for messages that are
due, saves them as normal messages and pushes them to both users over Socket.IO.
"""
from datetime import datetime, timezone

import time

import database as db
import large_files
import uploads
from auto_reply import maybe_reply
from exceptions import ChatError
from models import Message
from utils import log_event, utc_now_text

CHECK_EVERY_SECONDS = 2


def deliver_due_messages(socketio):
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    for item in db.claim_due_scheduled(now):
        sender_room = f"user-{item['sender_id']}"
        receiver_room = f"user-{item['receiver_id']}"
        try:
            row = db.save_message(item["sender_id"], item["receiver_id"], item["text"])
        except ChatError as err:
            db.mark_scheduled_failed(item["id"])
            log_event(f"SCHEDULED FAILED {item['id']}: {err}")
            socketio.emit("error message",
                          {"error": "A scheduled message could not be sent"}, to=sender_room)
            socketio.emit("scheduled sent", {"id": item["id"]}, to=sender_room)
            continue

        payload = Message.from_row(row).to_dict()
        socketio.emit("private message", payload, to=receiver_room)
        socketio.emit("private message", payload, to=sender_room)
        socketio.emit("scheduled sent", {"id": item["id"]}, to=sender_room)
        log_event(f"SCHEDULED SENT {item['id']}: {item['sender_id']} -> {item['receiver_id']}")
        maybe_reply(socketio, row)


def purge_expired_messages(socketio):
    """Delete messages whose disappearing timer ran out, remove their files and
    tell both people so the message vanishes from their screens."""
    expired = db.delete_expired_messages(utc_now_text())
    if not expired:
        return

    ids_by_chat = {}                      # (sender, receiver) -> [message ids]
    for row in expired:
        if row["attachment_url"]:
            uploads.delete_file(row["attachment_url"])
        ids_by_chat.setdefault((row["sender_id"], row["receiver_id"]), []).append(row["id"])

    for (sender_id, receiver_id), ids in ids_by_chat.items():
        for room in (f"user-{sender_id}", f"user-{receiver_id}"):
            socketio.emit("messages expired", {"ids": ids}, to=room)
    log_event(f"EXPIRED {len(expired)} message(s) deleted")


_last_large_cleanup = 0.0


def purge_large_files(socketio):
    """Delete expired shared files and abandoned uploads (checked once a minute)."""
    global _last_large_cleanup
    if time.monotonic() - _last_large_cleanup < 60:
        return
    _last_large_cleanup = time.monotonic()
    large_files.purge()


def scheduler_loop(socketio):
    while True:
        # Every task is wrapped separately: the worker must never die,
        # and one failing task must not stop the others.
        for task in (deliver_due_messages, purge_expired_messages, purge_large_files):
            try:
                task(socketio)
            except Exception as err:
                log_event(f"SCHEDULER ERROR in {task.__name__}: {type(err).__name__}: {err}")
        socketio.sleep(CHECK_EVERY_SECONDS)


def start_scheduler(socketio):
    socketio.start_background_task(scheduler_loop, socketio)
"""Keyword auto-reply: answers incoming messages on behalf of the receiver.

Safety rules (without them two auto-replies could answer each other forever):
  1. An automatic reply never triggers another automatic reply.
  2. A person gets at most one automatic reply per cooldown period.
  3. Only the receiver's own, enabled rules are used; the first matching rule wins.
"""
import database as db
from models import Message, AutoReplyRule
from utils import log_event

AUTO_REPLY_COOLDOWN_SECONDS = 60


def find_rule(receiver_id, text):
    """Return the first enabled rule of `receiver_id` that matches `text`, or None."""
    for row in db.list_rules(receiver_id):
        rule = AutoReplyRule.from_row(row)
        if rule.matches(text):
            return rule
    return None


def maybe_reply(socketio, row):
    """Call this after a normal message was saved and delivered."""
    try:
        if row["is_auto"]:                                   # rule 1: no reply to auto-replies
            return
        sender_id, receiver_id = row["sender_id"], row["receiver_id"]
        if sender_id == receiver_id or not (row["text"] or "").strip():
            return

        rule = find_rule(receiver_id, row["text"])
        if rule is None:
            return
        if db.recent_auto_reply_exists(receiver_id, sender_id,        # rule 2: cooldown
                                       AUTO_REPLY_COOLDOWN_SECONDS):
            return

        reply_row = db.save_message(receiver_id, sender_id, rule.reply_text, is_auto=True)
        payload = Message.from_row(reply_row).to_dict()
        socketio.emit("private message", payload, to=f"user-{sender_id}")
        socketio.emit("private message", payload, to=f"user-{receiver_id}")
        log_event(f"AUTO-REPLY rule {rule.id}: {receiver_id} -> {sender_id}")
    except Exception as err:          # an auto-reply problem must never break normal chatting
        log_event(f"AUTO-REPLY ERROR {type(err).__name__}: {err}")
import sqlite3
import threading

from exceptions import (UserAlreadyExistsError, UserNotFoundError,
                        InvalidMessageError)
from utils import utc_now_text

DB_PATH = "chat.db"
db_lock = threading.Lock()   # only one thread writes at a time

MESSAGE_EXTRA_COLUMNS = [
    ("attachment_url", "TEXT"),
    ("attachment_name", "TEXT"),
    ("attachment_kind", "TEXT"),
    ("attachment_size", "INTEGER"),
    ("expires_at", "TEXT"),            # disappearing messages
]


def _casefold(value):
    """SQL helper: lower-case that also works for non-English text."""
    return value.casefold() if isinstance(value, str) else ""


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.create_function("casefold", 1, _casefold, deterministic=True)
    return conn


def init_db():
    with db_lock:
        conn = get_connection()
        try:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    role TEXT NOT NULL DEFAULT 'user',
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                );
                CREATE TABLE IF NOT EXISTS messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    sender_id INTEGER NOT NULL,
                    receiver_id INTEGER NOT NULL,
                    text TEXT NOT NULL,
                    timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (sender_id) REFERENCES users(id),
                    FOREIGN KEY (receiver_id) REFERENCES users(id)
                );
                CREATE TABLE IF NOT EXISTS chat_settings (
                    user_low INTEGER NOT NULL,
                    user_high INTEGER NOT NULL,
                    disappear_seconds INTEGER NOT NULL DEFAULT 0,
                    PRIMARY KEY (user_low, user_high)
                );
                CREATE TABLE IF NOT EXISTS scheduled_messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    sender_id INTEGER NOT NULL,
                    receiver_id INTEGER NOT NULL,
                    text TEXT NOT NULL,
                    send_at TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'pending',
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (sender_id) REFERENCES users(id),
                    FOREIGN KEY (receiver_id) REFERENCES users(id)
                );
            """)
            # Migration: add the newer columns to an older messages table
            existing = {row["name"] for row in conn.execute("PRAGMA table_info(messages)")}
            for column, column_type in MESSAGE_EXTRA_COLUMNS:
                if column not in existing:
                    conn.execute(f"ALTER TABLE messages ADD COLUMN {column} {column_type}")
            conn.commit()
        finally:
            conn.close()


def _read(sql, params=(), one=False):
    conn = get_connection()
    try:
        cur = conn.execute(sql, params)
        return cur.fetchone() if one else cur.fetchall()
    finally:
        conn.close()


# ---------- CREATE ----------
def create_user(username, password_hash, role="user"):
    with db_lock:
        conn = get_connection()
        try:
            cur = conn.execute(
                "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
                (username, password_hash, role))
            conn.commit()
            return cur.lastrowid
        except sqlite3.IntegrityError:
            raise UserAlreadyExistsError(f"Username '{username}' is already taken")
        finally:
            conn.close()


def save_message(sender_id, receiver_id, text, attachment=None):
    """Save a message. `attachment` is the dict returned by uploads.describe()."""
    text = (text or "").strip()
    if not text and not attachment:
        raise InvalidMessageError("Message cannot be empty")
    if get_user_by_id(sender_id) is None or get_user_by_id(receiver_id) is None:
        raise UserNotFoundError("Sender or receiver does not exist")
    attachment = attachment or {}
    # If this chat has a disappearing-messages timer, the message gets an expiry time
    seconds = get_disappear_seconds(sender_id, receiver_id)
    expires_at = utc_now_text(seconds) if seconds > 0 else None
    with db_lock:
        conn = get_connection()
        try:
            cur = conn.execute(
                """INSERT INTO messages
                   (sender_id, receiver_id, text,
                    attachment_url, attachment_name, attachment_kind, attachment_size,
                    expires_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (sender_id, receiver_id, text,
                 attachment.get("url"), attachment.get("name"),
                 attachment.get("kind"), attachment.get("size"), expires_at))
            conn.commit()
            msg_id = cur.lastrowid
        finally:
            conn.close()
    return _read("SELECT * FROM messages WHERE id = ?", (msg_id,), one=True)


# ---------- READ ----------
def get_user_by_username(username):
    return _read("SELECT * FROM users WHERE username = ?", (username,), one=True)


def get_user_by_id(user_id):
    return _read("SELECT * FROM users WHERE id = ?", (user_id,), one=True)


def get_all_users():
    return _read("SELECT * FROM users ORDER BY username")


def get_history(user_a, user_b):
    return _read(
        """SELECT * FROM messages
           WHERE ((sender_id = ? AND receiver_id = ?)
               OR (sender_id = ? AND receiver_id = ?))
             AND (expires_at IS NULL OR expires_at > ?)
           ORDER BY id""",
        (user_a, user_b, user_b, user_a, utc_now_text()))


# ---------- DELETE ----------
def delete_message(message_id):
    with db_lock:
        conn = get_connection()
        try:
            cur = conn.execute("DELETE FROM messages WHERE id = ?", (message_id,))
            conn.commit()
            return cur.rowcount > 0
        finally:
            conn.close()


# ================= Scheduled messages =================
def create_scheduled(sender_id, receiver_id, text, send_at):
    """send_at must already be a UTC string 'YYYY-MM-DD HH:MM:SS'."""
    text = (text or "").strip()
    if not text:
        raise InvalidMessageError("Message cannot be empty")
    if get_user_by_id(sender_id) is None or get_user_by_id(receiver_id) is None:
        raise UserNotFoundError("Sender or receiver does not exist")
    with db_lock:
        conn = get_connection()
        try:
            cur = conn.execute(
                """INSERT INTO scheduled_messages (sender_id, receiver_id, text, send_at)
                   VALUES (?, ?, ?, ?)""",
                (sender_id, receiver_id, text, send_at))
            conn.commit()
            new_id = cur.lastrowid
        finally:
            conn.close()
    return _read("SELECT * FROM scheduled_messages WHERE id = ?", (new_id,), one=True)


def list_pending_scheduled(sender_id):
    return _read(
        """SELECT * FROM scheduled_messages
           WHERE sender_id = ? AND status = 'pending'
           ORDER BY send_at""", (sender_id,))


def cancel_scheduled(schedule_id, sender_id):
    """Only the sender can cancel, and only while the message is still pending."""
    with db_lock:
        conn = get_connection()
        try:
            cur = conn.execute(
                """UPDATE scheduled_messages SET status = 'cancelled'
                   WHERE id = ? AND sender_id = ? AND status = 'pending'""",
                (schedule_id, sender_id))
            conn.commit()
            return cur.rowcount > 0
        finally:
            conn.close()


def claim_due_scheduled(now_text):
    """Atomically take every pending message that is due and mark it 'sent'.

    Doing select + update inside one lock means a message can never be
    claimed (and therefore sent) twice.
    """
    with db_lock:
        conn = get_connection()
        try:
            rows = conn.execute(
                """SELECT * FROM scheduled_messages
                   WHERE status = 'pending' AND send_at <= ?
                   ORDER BY send_at, id""", (now_text,)).fetchall()
            for row in rows:
                conn.execute("UPDATE scheduled_messages SET status = 'sent' WHERE id = ?",
                             (row["id"],))
            conn.commit()
            return rows
        finally:
            conn.close()


def mark_scheduled_failed(schedule_id):
    with db_lock:
        conn = get_connection()
        try:
            conn.execute("UPDATE scheduled_messages SET status = 'failed' WHERE id = ?",
                         (schedule_id,))
            conn.commit()
        finally:
            conn.close()


# ================= Disappearing messages =================
def get_disappear_seconds(user_a, user_b):
    low, high = sorted((user_a, user_b))
    row = _read("SELECT disappear_seconds FROM chat_settings WHERE user_low = ? AND user_high = ?",
                (low, high), one=True)
    return row["disappear_seconds"] if row else 0


def set_disappear_seconds(user_a, user_b, seconds):
    low, high = sorted((user_a, user_b))
    with db_lock:
        conn = get_connection()
        try:
            conn.execute(
                "INSERT OR REPLACE INTO chat_settings (user_low, user_high, disappear_seconds) VALUES (?, ?, ?)",
                (low, high, seconds))
            conn.commit()
        finally:
            conn.close()


def delete_expired_messages(now_text):
    """Delete every message whose time is up and return what was deleted."""
    with db_lock:
        conn = get_connection()
        try:
            rows = conn.execute(
                """SELECT id, sender_id, receiver_id, attachment_url FROM messages
                   WHERE expires_at IS NOT NULL AND expires_at <= ?""", (now_text,)).fetchall()
            if rows:
                conn.execute("DELETE FROM messages WHERE expires_at IS NOT NULL AND expires_at <= ?",
                             (now_text,))
                conn.commit()
            return rows
        finally:
            conn.close()


# ================= Search =================
def escape_like(text):
    """Make % and _ in the user's text match literally inside a LIKE pattern."""
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def search_messages(user_id, query, other_id=None, kind=None, limit=50):
    """Find messages (newest first) that the user sent or received.

    Matches the message text and the attachment file name, ignoring case.
    Optional filters: one chat partner (other_id) and one attachment kind.
    """
    pattern = f"%{escape_like(query.casefold())}%"
    sql = r"""SELECT * FROM messages
              WHERE (sender_id = ? OR receiver_id = ?)
                AND (expires_at IS NULL OR expires_at > ?)
                AND (casefold(text) LIKE ? ESCAPE '\'
                     OR casefold(attachment_name) LIKE ? ESCAPE '\')"""
    params = [user_id, user_id, utc_now_text(), pattern, pattern]

    if other_id is not None:
        sql += """ AND ((sender_id = ? AND receiver_id = ?)
                     OR (sender_id = ? AND receiver_id = ?))"""
        params += [user_id, other_id, other_id, user_id]
    if kind:
        sql += " AND attachment_kind = ?"
        params.append(kind)

    sql += " ORDER BY id DESC LIMIT ?"
    params.append(limit)
    return _read(sql, tuple(params))
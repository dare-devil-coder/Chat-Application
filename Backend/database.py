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
    ("is_auto", "INTEGER NOT NULL DEFAULT 0"),   # automatic replies
    ("attachment_expires", "TEXT"),    # expiry of a shared large-file link
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
                CREATE TABLE IF NOT EXISTS large_uploads (
                    id TEXT PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    filename TEXT NOT NULL,
                    size INTEGER NOT NULL,
                    chunk_size INTEGER NOT NULL,
                    total_chunks INTEGER NOT NULL,
                    expires_in INTEGER NOT NULL,
                    status TEXT NOT NULL DEFAULT 'uploading',
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                );
                CREATE TABLE IF NOT EXISTS shared_files (
                    token TEXT PRIMARY KEY,
                    owner_id INTEGER NOT NULL,
                    original_name TEXT NOT NULL,
                    size INTEGER NOT NULL,
                    sha256 TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    expires_at TEXT NOT NULL,
                    download_count INTEGER NOT NULL DEFAULT 0
                );
                CREATE TABLE IF NOT EXISTS auto_reply_rules (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    keyword TEXT NOT NULL,
                    reply_text TEXT NOT NULL,
                    enabled INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id)
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


def save_message(sender_id, receiver_id, text, attachment=None, is_auto=False):
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
                    expires_at, is_auto, attachment_expires)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (sender_id, receiver_id, text,
                 attachment.get("url"), attachment.get("name"),
                 attachment.get("kind"), attachment.get("size"), expires_at,
                 1 if is_auto else 0, attachment.get("expires_at")))
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


# ================= Auto-reply rules =================
MAX_RULES_PER_USER = 20


def create_rule(user_id, keyword, reply_text):
    keyword = (keyword or "").strip()
    reply_text = (reply_text or "").strip()
    if not keyword or not reply_text:
        raise InvalidMessageError("Keyword and reply cannot be empty")
    if len(keyword) > 50 or len(reply_text) > 500:
        raise InvalidMessageError("Keyword is limited to 50 characters and the reply to 500")
    if get_user_by_id(user_id) is None:
        raise UserNotFoundError("User does not exist")
    if len(list_rules(user_id)) >= MAX_RULES_PER_USER:
        raise InvalidMessageError(f"You can have at most {MAX_RULES_PER_USER} rules")
    with db_lock:
        conn = get_connection()
        try:
            cur = conn.execute(
                "INSERT INTO auto_reply_rules (user_id, keyword, reply_text) VALUES (?, ?, ?)",
                (user_id, keyword, reply_text))
            conn.commit()
            rule_id = cur.lastrowid
        finally:
            conn.close()
    return _read("SELECT * FROM auto_reply_rules WHERE id = ?", (rule_id,), one=True)


def list_rules(user_id):
    return _read("SELECT * FROM auto_reply_rules WHERE user_id = ? ORDER BY id", (user_id,))


def set_rule_enabled(rule_id, user_id, enabled):
    with db_lock:
        conn = get_connection()
        try:
            cur = conn.execute(
                "UPDATE auto_reply_rules SET enabled = ? WHERE id = ? AND user_id = ?",
                (1 if enabled else 0, rule_id, user_id))
            conn.commit()
            return cur.rowcount > 0
        finally:
            conn.close()


def delete_rule(rule_id, user_id):
    with db_lock:
        conn = get_connection()
        try:
            cur = conn.execute("DELETE FROM auto_reply_rules WHERE id = ? AND user_id = ?",
                               (rule_id, user_id))
            conn.commit()
            return cur.rowcount > 0
        finally:
            conn.close()


def get_rule(rule_id):
    return _read("SELECT * FROM auto_reply_rules WHERE id = ?", (rule_id,), one=True)


def recent_auto_reply_exists(owner_id, other_id, seconds):
    """Did `owner_id` already auto-reply to `other_id` within the last `seconds`?"""
    row = _read(
        """SELECT 1 FROM messages
           WHERE sender_id = ? AND receiver_id = ? AND is_auto = 1 AND timestamp > ?
           LIMIT 1""",
        (owner_id, other_id, utc_now_text(-seconds)), one=True)
    return row is not None


# ================= Large files: chunked uploads and shared links =================
def create_large_upload(upload_id, user_id, filename, size, chunk_size, total_chunks, expires_in):
    with db_lock:
        conn = get_connection()
        try:
            conn.execute(
                """INSERT INTO large_uploads
                   (id, user_id, filename, size, chunk_size, total_chunks, expires_in)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (upload_id, user_id, filename, size, chunk_size, total_chunks, expires_in))
            conn.commit()
        finally:
            conn.close()


def get_large_upload(upload_id):
    return _read("SELECT * FROM large_uploads WHERE id = ?", (upload_id,), one=True)


def count_active_uploads(user_id):
    row = _read("SELECT COUNT(*) AS n FROM large_uploads WHERE user_id = ? AND status != 'done'",
                (user_id,), one=True)
    return row["n"]


def change_large_upload_status(upload_id, old_status, new_status):
    """Atomically move an upload from old_status to new_status; False if it was not in old_status."""
    with db_lock:
        conn = get_connection()
        try:
            cur = conn.execute("UPDATE large_uploads SET status = ? WHERE id = ? AND status = ?",
                               (new_status, upload_id, old_status))
            conn.commit()
            return cur.rowcount > 0
        finally:
            conn.close()


def delete_large_upload(upload_id):
    with db_lock:
        conn = get_connection()
        try:
            conn.execute("DELETE FROM large_uploads WHERE id = ?", (upload_id,))
            conn.commit()
        finally:
            conn.close()


def stale_large_uploads(created_before):
    return _read("SELECT * FROM large_uploads WHERE created_at < ?", (created_before,))


def create_shared_file(token, owner_id, original_name, size, sha256, expires_at):
    with db_lock:
        conn = get_connection()
        try:
            conn.execute(
                """INSERT INTO shared_files (token, owner_id, original_name, size, sha256, expires_at)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (token, owner_id, original_name, size, sha256, expires_at))
            conn.commit()
        finally:
            conn.close()


def get_shared_file(token):
    return _read("SELECT * FROM shared_files WHERE token = ?", (token,), one=True)


def count_download(token):
    with db_lock:
        conn = get_connection()
        try:
            conn.execute("UPDATE shared_files SET download_count = download_count + 1 WHERE token = ?",
                         (token,))
            conn.commit()
        finally:
            conn.close()


def active_shared_bytes(user_id, now_text):
    row = _read("SELECT COALESCE(SUM(size), 0) AS total FROM shared_files "
                "WHERE owner_id = ? AND expires_at > ?", (user_id, now_text), one=True)
    return row["total"]


def expired_shared_files(now_text):
    return _read("SELECT * FROM shared_files WHERE expires_at <= ?", (now_text,))


def delete_shared_file(token):
    with db_lock:
        conn = get_connection()
        try:
            conn.execute("DELETE FROM shared_files WHERE token = ?", (token,))
            conn.commit()
        finally:
            conn.close()
import sqlite3
import threading

from exceptions import (UserAlreadyExistsError, UserNotFoundError,
                        InvalidMessageError)

DB_PATH = "chat.db"
db_lock = threading.Lock()   # only one thread writes at a time


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
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
            """)
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


def save_message(sender_id, receiver_id, text):
    text = (text or "").strip()
    if not text:
        raise InvalidMessageError("Message cannot be empty")
    if get_user_by_id(sender_id) is None or get_user_by_id(receiver_id) is None:
        raise UserNotFoundError("Sender or receiver does not exist")
    with db_lock:
        conn = get_connection()
        try:
            cur = conn.execute(
                "INSERT INTO messages (sender_id, receiver_id, text) VALUES (?, ?, ?)",
                (sender_id, receiver_id, text))
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
           WHERE (sender_id = ? AND receiver_id = ?)
              OR (sender_id = ? AND receiver_id = ?)
           ORDER BY id""",
        (user_a, user_b, user_b, user_a))


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
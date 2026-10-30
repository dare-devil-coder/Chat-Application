"""Large files: chunked upload, assembling, and expiring download links.

Flow:  start  ->  upload every chunk (any order, can be repeated)  ->  complete
The finished file is stored under a random token and is reachable at /f/<token>
until its expiry time. A background task then deletes it.
"""
import hashlib
import math
import os
import re
import secrets
import shutil
import uuid

import database as db
from exceptions import (InvalidInputError, UserNotFoundError, FileTooLargeError,
                        LinkExpiredError, UploadNotFoundError, UnsupportedFileError,
                        AttachmentNotFoundError)
from utils import utc_now_text, log_event

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TMP_DIR = os.path.join(BASE_DIR, "large_tmp")        # chunks while uploading
FILES_DIR = os.path.join(BASE_DIR, "large_files")    # finished files

CHUNK_SIZE = 5 * 1024 * 1024                         # 5 MB per chunk
MAX_LARGE_MB = 500
MAX_ACTIVE_BYTES_PER_USER = 2 * 1024 ** 3            # 2 GB of live links per user
MAX_ACTIVE_UPLOADS = 3
ALLOWED_EXPIRY = {3600, 86400, 604800}               # 1 hour, 1 day, 7 days
DEFAULT_EXPIRY = 604800
STALE_UPLOAD_SECONDS = 24 * 3600
READ_BLOCK = 1024 * 1024
MIN_FREE_BYTES = 100 * 1024 * 1024                   # keep 100 MB free on the disk

# Files that are downloaded, never shown in the page, but we still refuse programs
BLOCKED_EXTENSIONS = {"exe", "bat", "cmd", "com", "scr", "msi", "vbs", "ps1", "jar", "dll"}

_UPLOAD_ID = re.compile(r"[0-9a-f]{32}")
_PART = re.compile(r"(\d{6})\.part")


def clean_filename(name):
    """Keep only the file name (no folders) and drop control characters."""
    base = os.path.basename((name or "").replace("\\", "/"))
    base = "".join(ch for ch in base if ch.isprintable()).strip()
    if not base or base in (".", ".."):
        raise InvalidInputError("File name is missing")
    return base[:150]


def _upload_dir(upload_id):
    return os.path.join(TMP_DIR, upload_id)


def _part_path(upload_id, index):
    return os.path.join(_upload_dir(upload_id), f"{index:06d}.part")


def _get_upload(upload_id, user_id, must_be_uploading=True):
    row = db.get_large_upload(upload_id) if _UPLOAD_ID.fullmatch(upload_id or "") else None
    if row is None or row["user_id"] != user_id:
        raise UploadNotFoundError("Upload not found")
    if must_be_uploading and row["status"] != "uploading":
        raise InvalidInputError("This upload is already finished")
    return row


# ------------------------------------------------------------------ start
def start_upload(user_id, filename, size, expires_in=None):
    if not isinstance(size, int) or isinstance(size, bool) or size <= 0:
        raise InvalidInputError("File size must be a positive number")
    if size > MAX_LARGE_MB * 1024 * 1024:
        raise FileTooLargeError(f"Files can be at most {MAX_LARGE_MB} MB")
    expires_in = DEFAULT_EXPIRY if expires_in is None else expires_in
    if expires_in not in ALLOWED_EXPIRY:
        raise InvalidInputError("Unsupported link expiry")
    if db.get_user_by_id(user_id) is None:
        raise UserNotFoundError("User does not exist")

    filename = clean_filename(filename)
    extension = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if extension in BLOCKED_EXTENSIONS:
        raise UnsupportedFileError(f"Files of type '.{extension}' cannot be shared")

    if db.count_active_uploads(user_id) >= MAX_ACTIVE_UPLOADS:
        raise InvalidInputError(f"You can upload at most {MAX_ACTIVE_UPLOADS} files at the same time")
    if db.active_shared_bytes(user_id, utc_now_text()) + size > MAX_ACTIVE_BYTES_PER_USER:
        raise FileTooLargeError("You have reached your limit of shared files; wait for old links to expire")

    os.makedirs(TMP_DIR, exist_ok=True)
    os.makedirs(FILES_DIR, exist_ok=True)
    if shutil.disk_usage(BASE_DIR).free < size + MIN_FREE_BYTES:
        raise FileTooLargeError("The server does not have enough free disk space")

    upload_id = uuid.uuid4().hex
    total_chunks = math.ceil(size / CHUNK_SIZE)
    os.makedirs(_upload_dir(upload_id))
    db.create_large_upload(upload_id, user_id, filename, size, CHUNK_SIZE, total_chunks, expires_in)
    log_event(f"LARGE upload started: user {user_id}, {size} bytes, {total_chunks} chunk(s)")
    return {"upload_id": upload_id, "chunk_size": CHUNK_SIZE, "total_chunks": total_chunks,
            "expires_in": expires_in}


# ------------------------------------------------------------------ chunks
def save_chunk(upload_id, user_id, index, data):
    row = _get_upload(upload_id, user_id)
    if not 0 <= index < row["total_chunks"]:
        raise InvalidInputError("Chunk number is out of range")
    if index == row["total_chunks"] - 1:
        expected = row["size"] - index * row["chunk_size"]
    else:
        expected = row["chunk_size"]
    if len(data) != expected:
        raise InvalidInputError(f"Chunk {index} must be exactly {expected} bytes")

    final = _part_path(upload_id, index)
    temporary = final + ".tmp"
    with open(temporary, "wb") as f:
        f.write(data)
    os.replace(temporary, final)        # atomic: a chunk is either complete or missing


def received_chunks(upload_id, user_id):
    row = _get_upload(upload_id, user_id, must_be_uploading=False)
    found = []
    if os.path.isdir(_upload_dir(upload_id)):
        for name in os.listdir(_upload_dir(upload_id)):
            match = _PART.fullmatch(name)
            if match:
                found.append(int(match.group(1)))
    return {"received": sorted(found), "total_chunks": row["total_chunks"], "status": row["status"]}


def iter_file_blocks(upload_id, total_chunks):
    """Generator: yields the whole file, block by block, in chunk order."""
    for index in range(total_chunks):
        with open(_part_path(upload_id, index), "rb") as part:
            while True:
                block = part.read(READ_BLOCK)
                if not block:
                    break
                yield block


# ------------------------------------------------------------------ complete
def finish_upload(upload_id, user_id):
    row = _get_upload(upload_id, user_id)
    missing = set(range(row["total_chunks"])) - set(received_chunks(upload_id, user_id)["received"])
    if missing:
        raise InvalidInputError(f"{len(missing)} chunk(s) are still missing")

    # Only one request may assemble the file (a second "complete" is refused)
    if not db.change_large_upload_status(upload_id, "uploading", "assembling"):
        raise InvalidInputError("This upload is already being finished")

    token = secrets.token_urlsafe(16)
    final_path = os.path.join(FILES_DIR, token)
    temporary = final_path + ".tmp"
    try:
        digest = hashlib.sha256()
        written = 0
        with open(temporary, "wb") as out:
            for block in iter_file_blocks(upload_id, row["total_chunks"]):
                out.write(block)
                digest.update(block)
                written += len(block)
        if written != row["size"]:
            raise InvalidInputError("The assembled file has the wrong size")
        os.replace(temporary, final_path)
    except Exception:
        if os.path.exists(temporary):
            os.remove(temporary)
        db.change_large_upload_status(upload_id, "assembling", "uploading")   # allow a retry
        raise

    expires_at = utc_now_text(row["expires_in"])
    db.create_shared_file(token, user_id, row["filename"], row["size"], digest.hexdigest(), expires_at)
    shutil.rmtree(_upload_dir(upload_id), ignore_errors=True)
    db.delete_large_upload(upload_id)
    log_event(f"LARGE file shared: user {user_id}, {row['size']} bytes, link {token[:6]}...")
    return {"token": token, "name": row["filename"], "size": row["size"],
            "sha256": digest.hexdigest(), "expires_at": expires_at}


# ------------------------------------------------------------------ links
def _live_share(token):
    row = db.get_shared_file(token)
    if row is None:
        raise AttachmentNotFoundError("This link does not exist")
    if row["expires_at"] <= utc_now_text():
        raise LinkExpiredError("This link has expired")
    return row


def describe_shared(token, owner_id):
    """Attachment info for a chat message. Only the owner of the file can send its link."""
    try:
        row = _live_share(token)
    except AttachmentNotFoundError:
        raise AttachmentNotFoundError("Shared file not found")
    if row["owner_id"] != owner_id:
        raise AttachmentNotFoundError("Shared file not found")
    return {"url": f"/f/{token}", "name": row["original_name"], "kind": "shared",
            "size": row["size"], "expires_at": row["expires_at"]}


def get_for_download(token):
    row = _live_share(token)
    path = os.path.join(FILES_DIR, token)
    if not os.path.isfile(path):
        raise AttachmentNotFoundError("This file is no longer available")
    return row, path


# ------------------------------------------------------------------ cleanup
def purge(now_text=None):
    """Delete expired shared files and abandoned uploads. Returns (files, uploads)."""
    now_text = now_text or utc_now_text()
    files = 0
    for row in db.expired_shared_files(now_text):
        path = os.path.join(FILES_DIR, row["token"])
        try:
            os.remove(path)
        except FileNotFoundError:
            pass
        db.delete_shared_file(row["token"])
        files += 1

    uploads = 0
    for row in db.stale_large_uploads(utc_now_text(-STALE_UPLOAD_SECONDS)):
        shutil.rmtree(_upload_dir(row["id"]), ignore_errors=True)
        db.delete_large_upload(row["id"])
        uploads += 1
    if files or uploads:
        log_event(f"LARGE cleanup: {files} expired file(s), {uploads} abandoned upload(s)")
    return files, uploads
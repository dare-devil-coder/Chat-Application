"""File uploads: validation, saving and describing attachments."""
import os
import uuid

from werkzeug.utils import secure_filename

from exceptions import UnsupportedFileError, AttachmentNotFoundError
from utils import log_event

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads")
MAX_UPLOAD_MB = 25

# Only these extensions are accepted (so nobody can upload .html or .exe files)
ALLOWED = {
    "image": {"png", "jpg", "jpeg", "gif", "webp"},
    "video": {"mp4", "webm", "mov"},
    "file": {"pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv", "zip"},
    # voice messages recorded in the browser (the browser names audio-only webm ".weba")
    "audio": {"weba", "ogg", "oga", "mp3", "wav", "m4a", "aac"},
}

# Browsers need the right Content-Type to play audio, so it is set explicitly
AUDIO_MIME = {
    "weba": "audio/webm",
    "ogg": "audio/ogg",
    "oga": "audio/ogg",
    "mp3": "audio/mpeg",
    "wav": "audio/wav",
    "m4a": "audio/mp4",
    "aac": "audio/aac",
}


def extension_of(filename):
    return filename.rsplit(".", 1)[-1].lower() if "." in filename else ""


def mimetype_for(filename):
    """Content-Type for audio files, or None to let Flask work it out."""
    return AUDIO_MIME.get(extension_of(filename))


def kind_of(filename):
    ext = extension_of(filename)
    for kind, extensions in ALLOWED.items():
        if ext in extensions:
            return kind
    raise UnsupportedFileError(f"Files of type '.{ext}' are not allowed")


def describe(stored_name):
    """Build the attachment info from a stored file name.

    The client only sends the stored name (file_id); everything else is
    worked out here on the server, so a client cannot fake the details.
    """
    safe = os.path.basename(stored_name or "")
    path = os.path.join(UPLOAD_DIR, safe)
    if not safe or safe != stored_name or "_" not in safe or not os.path.isfile(path):
        raise AttachmentNotFoundError("Attachment not found")
    return {
        "file_id": safe,
        "url": f"/uploads/{safe}",
        "name": safe.split("_", 1)[1],          # original name after the uuid prefix
        "kind": kind_of(safe),
        "size": os.path.getsize(path),
    }


def save_upload(file_storage):
    original = file_storage.filename or ""
    kind_of(original)                            # raises if the type is not allowed
    ext = extension_of(original)
    stem = secure_filename(original.rsplit(".", 1)[0]) or "file"
    stored = f"{uuid.uuid4().hex}_{stem}.{ext}"

    os.makedirs(UPLOAD_DIR, exist_ok=True)
    file_storage.save(os.path.join(UPLOAD_DIR, stored))
    return describe(stored)


def delete_file(url):
    """Remove an uploaded file from disk (used when its message disappears)."""
    safe = os.path.basename(url or "")
    if not safe:
        return
    try:
        os.remove(os.path.join(UPLOAD_DIR, safe))
    except FileNotFoundError:
        pass                                   # already gone
    except OSError as err:
        log_event(f"Could not delete {safe}: {err}")
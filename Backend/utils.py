import threading
import time
from datetime import datetime, timedelta, timezone
from functools import wraps

from exceptions import InvalidInputError

_log_lock = threading.Lock()


def log_time(func):
    """Decorator: prints how long a function took."""
    @wraps(func)
    def wrapper(*args, **kwargs):
        start = time.perf_counter()
        try:
            return func(*args, **kwargs)
        finally:
            ms = (time.perf_counter() - start) * 1000
            print(f"[{func.__name__}] took {ms:.2f} ms")
    return wrapper


def paginate(items, size):
    """Generator: yields the list in pages of `size`."""
    assert size > 0, "page size must be positive"
    for i in range(0, len(items), size):
        yield items[i:i + size]


def log_event(message, filename="chat.log"):
    """Append a timestamped line to the log file (try/except/else/finally)."""
    with _log_lock:                      # threads must not write at the same time
        try:
            f = open(filename, "a", encoding="utf-8")
        except OSError as err:
            print("Could not open log file:", err)
        else:
            try:
                f.write(f"{datetime.now():%Y-%m-%d %H:%M:%S} | {message}\n")
            finally:
                f.close()


def parse_future_utc(iso_text, min_seconds=5, max_days=365):
    """Turn an ISO time from the browser (e.g. 2026-10-27T13:00:00.000Z) into a
    UTC string like '2026-10-27 13:00:00'. Rejects times in the past or too far away."""
    try:
        when = datetime.fromisoformat(str(iso_text).replace("Z", "+00:00"))
    except ValueError:
        raise InvalidInputError("Invalid date and time")
    if when.tzinfo is None:                       # no zone given -> treat as UTC
        when = when.replace(tzinfo=timezone.utc)
    when = when.astimezone(timezone.utc)

    now = datetime.now(timezone.utc)
    if when < now + timedelta(seconds=min_seconds):
        raise InvalidInputError("Please pick a time in the future")
    if when > now + timedelta(days=max_days):
        raise InvalidInputError(f"Messages can be scheduled at most {max_days} days ahead")
    return when.strftime("%Y-%m-%d %H:%M:%S")


def utc_now_text(offset_seconds=0):
    """Current UTC time (plus an optional offset) as 'YYYY-MM-DD HH:MM:SS'."""
    when = datetime.now(timezone.utc) + timedelta(seconds=offset_seconds)
    return when.strftime("%Y-%m-%d %H:%M:%S")
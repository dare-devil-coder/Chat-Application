import threading
import time
from datetime import datetime
from functools import wraps

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
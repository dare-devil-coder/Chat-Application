import time
from functools import wraps


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
    for i in range(0, len(items), size):
        yield items[i:i + size]
from __future__ import annotations

from pathlib import Path

_LOCK_FH = None


def acquire_single_instance_or_raise(lock_name: str) -> None:
    """
    Acquire a non-blocking process lock to ensure only one backend instance runs.
    Raises RuntimeError when another process already holds the lock.
    """
    global _LOCK_FH
    if _LOCK_FH is not None:
        return

    lock_path = Path("/tmp") / f"{lock_name}.lock"
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    fh = lock_path.open("a+", encoding="utf-8")
    try:
        import fcntl  # type: ignore

        fcntl.flock(fh.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError as exc:
        fh.close()
        raise RuntimeError(
            f"another Smart Mirror backend instance is already running (lock={lock_path})"
        ) from exc
    except Exception:
        # If locking isn't available, continue without hard-failing to keep compatibility.
        pass
    _LOCK_FH = fh


def release_single_instance() -> None:
    global _LOCK_FH
    fh = _LOCK_FH
    _LOCK_FH = None
    if fh is None:
        return
    try:
        import fcntl  # type: ignore

        fcntl.flock(fh.fileno(), fcntl.LOCK_UN)
    except Exception:
        pass
    try:
        fh.close()
    except Exception:
        pass

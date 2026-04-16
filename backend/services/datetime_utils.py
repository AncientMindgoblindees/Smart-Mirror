from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional


def parse_datetime_utc_naive(value: Any) -> Optional[datetime]:
    """Parse many timestamp shapes and normalize to naive UTC."""
    if value is None:
        return None
    if isinstance(value, datetime):
        dt = value
    else:
        text = str(value).strip()
        if not text:
            return None
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        elif " " in text and "T" not in text:
            text = text.replace(" ", "T", 1)
        if "+" not in text and "T" in text:
            text = text + "+00:00"
        try:
            dt = datetime.fromisoformat(text)
        except ValueError:
            return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    return dt.replace(tzinfo=None)


def to_iso_utc_z(value: Any) -> Optional[str]:
    dt = parse_datetime_utc_naive(value)
    if dt is None:
        return None
    return dt.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")

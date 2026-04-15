from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)


def _parse_dt(value: object) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)
    text = str(value).strip()
    if not text:
        return None
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(text)
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except ValueError:
        return None


def remote_wins(
    table_name: str,
    row_id: object,
    local_updated_at: object,
    remote_updated_at: object,
) -> bool:
    """Simple last-write-wins policy using updated timestamps."""
    local_dt = _parse_dt(local_updated_at)
    remote_dt = _parse_dt(remote_updated_at)

    winner = "remote"
    if local_dt and remote_dt and local_dt > remote_dt:
        winner = "local"

    if winner == "local":
        logger.info(
            "D1 conflict resolved to local row",
            extra={
                "table": table_name,
                "row_id": row_id,
                "local_updated_at": str(local_updated_at),
                "remote_updated_at": str(remote_updated_at),
                "winner": winner,
            },
        )
        return False

    logger.info(
        "D1 conflict resolved to remote row",
        extra={
            "table": table_name,
            "row_id": row_id,
            "local_updated_at": str(local_updated_at),
            "remote_updated_at": str(remote_updated_at),
            "winner": winner,
        },
    )
    return True

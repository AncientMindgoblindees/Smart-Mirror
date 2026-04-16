from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from backend.services.datetime_utils import parse_datetime_utc_naive

logger = logging.getLogger(__name__)


def _parse_dt(value: object) -> Optional[datetime]:
    parsed = parse_datetime_utc_naive(value)
    if parsed is None:
        return None
    return parsed.replace(tzinfo=timezone.utc)


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

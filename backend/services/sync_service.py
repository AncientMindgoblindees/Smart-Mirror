"""
Legacy sync manager retained as a lightweight no-op shim.

The multi-profile backend now proxies Google Calendar and Gmail per active mirror
profile instead of storing long-lived provider caches globally in SQLite.
"""

from __future__ import annotations

from typing import Optional


class SyncManager:
    async def start_all(self) -> None:
        return None

    async def start_provider_sync(self, provider_name: str, run_immediately: bool = True) -> None:
        return None

    def stop_provider_sync(self, provider_name: str) -> None:
        return None

    def stop_all(self) -> None:
        return None

    def get_last_sync(self, provider: str) -> Optional[str]:
        return None

    async def force_sync(self, provider_name: Optional[str] = None) -> None:
        return None


sync_manager = SyncManager()

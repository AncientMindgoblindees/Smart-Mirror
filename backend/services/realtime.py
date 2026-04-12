from typing import Any, Dict, Set

from fastapi import WebSocket


class WebSocketRegistry:
    """In-memory registry for a websocket channel."""

    def __init__(self) -> None:
        self.active: Set[WebSocket] = set()

    def connect(self, ws: WebSocket) -> None:
        self.active.add(ws)

    def disconnect(self, ws: WebSocket) -> None:
        self.active.discard(ws)

    async def broadcast(self, data: Dict[str, Any]) -> None:
        for ws in list(self.active):
            try:
                await ws.send_json(data)
            except Exception:
                self.active.discard(ws)


buttons_registry = WebSocketRegistry()
control_registry = WebSocketRegistry()

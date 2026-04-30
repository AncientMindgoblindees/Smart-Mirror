# Backend runtime boundaries

The current backend is intentionally a single `uvicorn` process.

Why multi-worker `uvicorn --workers N` is not compatible today:

- WebSocket fan-out state is stored in-process in [`backend/services/realtime.py`](/C:/Cursor_Projects/Smart-Mirror/backend/services/realtime.py:1) via `buttons_registry` and `control_registry`.
- Control-channel pairing state is also in-process in [`backend/api/events.py`](/C:/Cursor_Projects/Smart-Mirror/backend/api/events.py:66) via `_paired_sockets`.
- GPIO button handling is started inside the backend process on startup in [`backend/main.py`](/C:/Cursor_Projects/Smart-Mirror/backend/main.py:75).
- Runtime single-instance protection is deliberate in [`backend/main.py`](/C:/Cursor_Projects/Smart-Mirror/backend/main.py:71) and must stay in place unless the product architecture changes.
- SQLite is configured for the local appliance model in [`backend/database/session.py`](/C:/Cursor_Projects/Smart-Mirror/backend/database/session.py:8). Multiple worker processes would introduce separate connection pools and more write-contention/failure modes on the same DB file.

Recommended pattern:

- Keep one backend process for the mirror runtime: HTTP, WebSockets, GPIO, and SQLite.
- Offload only clearly identified CPU-bound work after profiling, using a targeted `ProcessPoolExecutor` or a separate worker process around that function.
- Keep blocking I/O off the event loop with `asyncio.to_thread(...)` where appropriate. This is already used in camera and try-on paths; no additional parallelism was added because there is no profiled CPU hotspot in the current codebase.

## Cursor Cloud specific instructions

### Project overview

Smart Mirror is a Raspberry Pi 5 information display with a **FastAPI** (Python) backend, vanilla HTML/CSS/JS frontend, and optional GPIO hardware layer. It is a single-service application — one Python process serves the REST API, WebSocket, and static UI.

### Running the dev server

```bash
ENABLE_DEV_ENDPOINTS=true uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

- Run from the **repo root** (`/workspace`).
- The UI is served at `http://localhost:8000/ui/`.
- Swagger docs at `http://localhost:8000/docs`.
- `ENABLE_DEV_ENDPOINTS=true` exposes `POST /api/dev/buttons` for simulated button events.
- SQLite DB (`data/mirror.db`) is auto-created on startup; no migrations or separate DB process needed.

### PATH caveat

`pip install` places executables in `~/.local/bin`, which is **not** on `PATH` by default in the Cloud Agent VM. The update script handles this, but if you launch `uvicorn` directly in a fresh shell, use `python3 -m uvicorn ...` or ensure `~/.local/bin` is on `PATH`.

### Lint & tests

The repository has **no lint configuration** (no flake8/pylint/ruff config, no pyproject.toml) and **no automated tests**. Use `python3 -m py_compile <file>` for syntax checks. The codebase uses implicit namespace packages (no `__init__.py` files).

### Known issues

- `PUT /api/widgets/` returns 500 due to a `NameError: name 'seen_ids' is not defined` in `backend/services/widget_service.py`. All other endpoints work.

### Environment variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `MIRROR_DB_PATH` | Override SQLite DB file path | `./data/mirror.db` |
| `DATABASE_URL` | Full SQLAlchemy DB URL override | `sqlite:///./data/mirror.db` |
| `ENABLE_GPIO` | Enable real GPIO hardware service | `false` |
| `ENABLE_DEV_ENDPOINTS` | Enable POST `/api/dev/buttons` | `false` |

# Smart Mirror UI (React + Vite)

## Development

From repo root:

```bash
cd ui
npm install
npm run dev
```

The Vite dev server proxies `/api` to `http://127.0.0.1:8002`. Start the backend in another terminal:

```bash
python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8002
```

Open `http://localhost:5173/ui/` (Vite serves with `base: /ui/`).

## Production build (served by FastAPI)

```bash
cd ui
npm install
npm run build
```

Output is written to `ui/dist/`. The backend mounts static files from `ui/dist` at `/ui`.

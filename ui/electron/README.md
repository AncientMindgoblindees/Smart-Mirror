# Native Camera Bridge (Electron)

This bridge exposes `window.smartMirrorCamera` so the try-on page can use native Pi camera runtime first (`picamera2`/`rpicam`) and only fall back to browser camera when unavailable.

## What was scaffolded

- `main.cjs`: Electron main process + IPC handlers.
- `preload.cjs`: Secure bridge exposed to renderer.
- `picamera_capture.py`: Minimal `picamera2` still-capture helper.
- `dev-runner.cjs`: Starts Vite then Electron for development.

## Renderer contract

The UI consumes:

- `window.smartMirrorCamera.getStatus()`
- `window.smartMirrorCamera.startPreview()`
- `window.smartMirrorCamera.stopPreview()`
- `window.smartMirrorCamera.capturePhoto()`

## Install

From `ui/`:

```bash
npm install
```

## Run (dev)

From `ui/`:

```bash
npm run dev:electron
```

This starts:
- Vite on `http://127.0.0.1:5173`
- Electron window that loads that URL

## Pi dependencies

On Raspberry Pi, ensure:

- `rpicam-hello` and `rpicam-still` are in PATH, and/or
- Python `picamera2` is installed for the Python runtime used by Electron main.

Quick checks:

```bash
which rpicam-still
which rpicam-hello
python3 -c "import picamera2; print('ok')"
```

## How it works

1. On try-on page load, renderer checks `window.smartMirrorCamera`.
2. If bridge exists and reports available, renderer uses bridge-native capture.
3. If bridge missing or unavailable, renderer falls back to browser `getUserMedia`.

## Notes

- Current preview starts `rpicam-hello --fullscreen` from Electron.
- Current still capture prefers `picamera2` when importable, else `rpicam-still`.
- If you want no fullscreen native preview, remove `startPreview()` call in renderer or change `main.cjs`.

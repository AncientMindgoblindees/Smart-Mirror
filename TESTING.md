# Testing

## Tools in this repo

- Backend API and database tests: `pytest` + FastAPI `TestClient`
- Mirror UI component tests: `Vitest` + React Testing Library
- Mirror UI smoke E2E: `Playwright`

## Install test dependencies

### Backend

The backend tests expect the normal backend environment plus the test-only extras in [backend/requirements-test.txt](/c:/Users/Jake%20Bleeden/y4hw/SmartMirror/Smart-Mirror/backend/requirements-test.txt:1).

```powershell
cd Smart-Mirror
.\.venv\Scripts\Activate
pip install -r backend/requirements-test.txt
```

`picamera2` is Pi-only and is not required to run the backend test suite on a non-Pi development machine.

### Mirror UI

From [Smart-Mirror/ui/package.json](/c:/Users/Jake%20Bleeden/y4hw/SmartMirror/Smart-Mirror/ui/package.json:1):

```powershell
cd Smart-Mirror\ui
npm install
npx playwright install
```

## Run tests

### Backend API + DB

```powershell
cd Smart-Mirror
python -m pytest
```

### Mirror UI component tests

```powershell
cd Smart-Mirror\ui
npm test
```

### Mirror UI E2E smoke

```powershell
cd Smart-Mirror\ui
npm run test:e2e
```

## Mocked external services

- Cloudinary uploads are mocked in backend tests.
- Try-on generation uses mocked Leonardo/remote result behavior in backend tests.
- No real API keys are required for automated tests.
- Cloudinary delete calls are still a TODO because the current production code only uploads and deletes the local DB row.

## Raspberry Pi / kiosk smoke checklist

- Pi boots successfully.
- Chromium opens automatically in mirror/kiosk mode.
- The mirror page loads at `/ui/`.
- Display orientation is correct for the installed monitor/mirror.
- No OS keyring popup blocks Chromium startup.
- Backend/API is reachable if the UI depends on live routes.
- Camera preview/capture works and no duplicate backend process owns the Pi camera.

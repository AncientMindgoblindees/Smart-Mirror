# Google OAuth setup (mirror)

Register app in **your** Google Cloud account. Mirror reads OAuth credentials from `.env`:

- Google web flow: `GOOGLE_WEB_CLIENT_ID`, `GOOGLE_WEB_CLIENT_SECRET`
- Google device/TV flow: `GOOGLE_TV_CLIENT_ID`, `GOOGLE_TV_CLIENT_SECRET`
- Legacy Google fallback: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`

## Callback URL mirror uses

Replace placeholders with values **you** use:

| Flow | Google |
|------|--------|
| Browser sign-in ("Sign in on this device") | `{BASE}/api/oauth/google/callback` |

`{BASE}` must match how browser reaches FastAPI server (scheme + host + port, no trailing slash):

- **LAN:** `http://192.168.1.50:8002` (example - use your Pi IP and `MIRROR_PORT` if not 8002)
- **Cloudflare Tunnel / HTTPS:** `https://mirror.example.com` (no port if 443)

Register every URL you will use (for example both `http://pi-ip:8002/...` and `https://your-tunnel-host/...`) so OAuth redirects are not rejected.

---

## Google Cloud Console

1. Open [Google Cloud Console](https://console.cloud.google.com/) and select/create project.
2. **APIs & Services** -> **Library** -> enable **Google Calendar API** and **Gmail API**.
3. **APIs & Services** -> **OAuth consent screen**
   - User type: **External** (or Internal if Workspace only).
   - Add scopes used by app:
     - `https://www.googleapis.com/auth/calendar.readonly`
     - `https://www.googleapis.com/auth/gmail.readonly`
   - Add test users while in "Testing" if app not published.
4. **APIs & Services** -> **Credentials** -> **Create credentials**.

### A) Web application (required for browser redirect)

- Application type: **Web application**.
- **Authorized redirect URIs** - add one or more (exact match, including `http` vs `https`):
  - `http://<PI_LAN_IP>:8002/api/oauth/google/callback`
  - `https://<your-tunnel-host>/api/oauth/google/callback` (if you use tunnel)
- Save. Copy **Client ID** and **Client secret** into `.env` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

### B) Device / QR flow ("TVs and Limited Input device")

Device-code flow (QR on mirror) often uses a separate OAuth client:

- **Create credentials** -> **TVs and Limited Input device** (or **Desktop** if that is what your console offers for device flow).
- Copy that client's ID and secret.

Backend supports separate Google credentials by flow:

- Browser sign-in path (`/api/oauth/google/start`) uses `GOOGLE_WEB_CLIENT_ID` / `GOOGLE_WEB_CLIENT_SECRET`.
- QR/device flow uses `GOOGLE_TV_CLIENT_ID` / `GOOGLE_TV_CLIENT_SECRET`.
- If split vars are not set, each flow falls back to `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
- Current behavior requires both `calendar.readonly` and `gmail.readonly` scopes for both browser and QR/device Google sign-in.
- Google QR flow now opens browser OAuth via QR link to `/api/oauth/google/start`.
  If mirror runs on localhost, set `OAUTH_PUBLIC_BASE_URL=https://<your-public-host>` so phone QR opens reachable URL.

---

## After configuration

1. Copy `.env.example` to `.env` and fill OAuth variables you need (and `MIRROR_TOKEN_SECRET` if needed).
2. Restart mirror backend so `load_dotenv` picks up changes.
3. Test **Accounts** in companion app: QR on mirror, then browser sign-in as needed.

---

## Checklist

- [ ] Google Calendar API + Gmail API enabled
- [ ] Google OAuth consent screen configured with calendar + gmail scopes
- [ ] `GOOGLE_WEB_CLIENT_ID`/`GOOGLE_WEB_CLIENT_SECRET` set for browser sign-in
- [ ] `GOOGLE_TV_CLIENT_ID`/`GOOGLE_TV_CLIENT_SECRET` set for QR/device flow
- [ ] (Optional fallback) `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` set only if not using split vars
- [ ] Secrets in `.env`, backend restarted

If redirect fails with `redirect_uri_mismatch`, URI in console does not match URL browser used (including port and `http` vs `https`).

# Google and Microsoft OAuth setup (mirror)

Register apps in **your** Google Cloud and Microsoft Entra (Azure AD) accounts. The mirror reads `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `MICROSOFT_CLIENT_ID`, and `MICROSOFT_CLIENT_SECRET` from `.env`.

## Callback URLs the mirror uses

Replace placeholders with values **you** use:

| Flow | Google | Microsoft |
|------|--------|-------------|
| Browser sign-in (“Sign in on this device”) | `{BASE}/api/oauth/google/callback` | `{BASE}/api/oauth/microsoft/callback` |

`{BASE}` must match how the **browser** reaches the FastAPI server (scheme + host + port, no trailing slash):

- **LAN:** `http://192.168.1.50:8002` (example — use your Pi’s IP and `MIRROR_PORT` if not 8002)
- **Cloudflare Tunnel / HTTPS:** `https://mirror.example.com` (no port if 443)

Register **every** URL you will use (e.g. both `http://pi-ip:8002/...` and `https://your-tunnel-host/...`) so OAuth redirects are not rejected.

---

## Google Cloud Console

1. Open [Google Cloud Console](https://console.cloud.google.com/) → select or create a project.
2. **APIs & Services** → **Library** → enable **Google Calendar API** (required for calendar sync).
3. **APIs & Services** → **OAuth consent screen**  
   - User type: **External** (or Internal if Workspace only).  
   - Add scopes used by the app: at minimum `https://www.googleapis.com/auth/calendar.readonly`.  
   - Add test users while in “Testing” if you are not publishing the app.
4. **APIs & Services** → **Credentials** → **Create credentials**.

### A) Web application (required for “Sign in on this device” / browser redirect)

- Application type: **Web application**.
- **Authorized redirect URIs** — add one or more (exact match, including `http` vs `https`):
  - `http://<PI_LAN_IP>:8002/api/oauth/google/callback`
  - `https://<your-tunnel-host>/api/oauth/google/callback` (if you use a tunnel)
- Save. Copy **Client ID** and **Client secret** into `.env` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

### B) Device / QR flow (“TVs and Limited Input device”)

The device-code flow (QR on mirror) often uses a **separate** OAuth client:

- **Create credentials** → **TVs and Limited Input device** (or **Desktop** if that is what your console offers for device flow).
- Copy that client’s ID and secret.

**Important:** This repository’s backend uses **one** pair `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` for **both** browser and device flows. Google does not always allow the same client to support every flow.

- If **both** flows must work with **one** credential, try the **Web application** client first and test QR + browser; some projects work with a single Web client for both.
- If device (QR) fails with a Web-only client, use the **TV / Limited Input** client ID/secret in `.env` for development focused on QR; use the **Web** client when you only need browser sign-in—or plan a future change to support two client IDs in code.

---

## Microsoft Entra ID (Azure) (Decommisioned due to Admin access is revoked on Student Accounts.)

1. Open [Azure Portal](https://portal.azure.com/) → **Microsoft Entra ID** → **App registrations** → **New registration**.
2. **Name:** e.g. `Smart Mirror`.  
   **Supported account types:** e.g. **Accounts in any organizational directory and personal Microsoft accounts** (or as you prefer).
3. **Register**. Open the app → note **Application (client) ID** → put in `.env` as `MICROSOFT_CLIENT_ID`.
4. **Certificates & secrets** → **New client secret** → copy value into `.env` as `MICROSOFT_CLIENT_SECRET` (secret **Value**, not Secret ID).
5. **Authentication** → **Platform configurations** → **Add a platform** → **Web**.
6. **Redirect URIs** — add (exact match):
   - `http://<PI_LAN_IP>:8002/api/oauth/microsoft/callback`
   - `https://<your-tunnel-host>/api/oauth/microsoft/callback` (if applicable)
7. **API permissions** → **Add a permission** → **Microsoft Graph** → **Delegated**: add at least **Calendars.Read**, **Tasks.Read**, **offline_access** (and **User.Read** if the portal suggests it). **Grant admin consent** if your tenant requires it.

Device-code and authorization-code flows use the same app registration; one client ID/secret is enough for both paths implemented on the mirror.

---

## After configuration

1. Copy `.env.example` to `.env` and fill in the four Google OAuth variables (and `MIRROR_TOKEN_SECRET` if needed).
2. Restart the mirror backend so `load_dotenv` picks up changes.
3. Test **Accounts** in the companion app: QR on mirror, then browser sign-in, as needed.

---

## Checklist

- [ ] Google Calendar API enabled  
- [ ] Google OAuth consent screen configured with calendar scope  
- [ ] Google **Web** client: redirect URI(s) exactly as `{BASE}/api/oauth/google/callback`  
- [ ] Google **TV/Limited Input** client created if QR/device flow requires it (same or separate `.env` as above)  
- [ ] Secrets in `.env`, backend restarted  

If redirect fails with `redirect_uri_mismatch`, the URI in the console does not match the URL the browser used (including port and `http` vs `https`).

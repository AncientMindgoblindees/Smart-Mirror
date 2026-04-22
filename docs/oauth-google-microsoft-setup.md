# Google OAuth setup

Microsoft OAuth has been removed from the backend. The mirror now supports Google-only browser OAuth and Google refresh-token ingestion for enrolled mirror profiles.

## Google Cloud setup

1. Enable the Google Calendar API and Gmail API in your Google Cloud project.
2. Configure the OAuth consent screen with:
   - `https://www.googleapis.com/auth/calendar.readonly`
   - `https://www.googleapis.com/auth/gmail.readonly`
3. Create a web OAuth client and register:
   - `http://<PI_IP>:8002/api/oauth/google/callback`
   - `https://<your-public-host>/api/oauth/google/callback`
4. Fill in `.env` with `GOOGLE_WEB_CLIENT_ID` and `GOOGLE_WEB_CLIENT_SECRET`.
5. Set `OAUTH_PUBLIC_BASE_URL=https://<your-public-host>` if you want to force the QR URL.
   If left blank, the backend will auto-detect `~/.cloudflared/config.yml` and use the configured tunnel hostname, preferring `mirror.*` when present.
6. Optionally set `GOOGLE_TV_CLIENT_ID` and `GOOGLE_TV_CLIENT_SECRET` if you use a separate limited-input client.

## Mirror profile flow

1. Register the mirror with `POST /api/mirror/register`.
2. Enroll a user with `POST /api/profile/enroll`.
3. Start Google linking with `POST /api/auth/login/google?hardware_id=...&user_id=...`.
4. Complete the phone/browser flow at `/api/oauth/google/start`.
5. The backend stores encrypted Google tokens in `oauth_credentials` and the UI only consumes filtered Gmail/Calendar payloads.

## Direct companion token ingestion

If the companion app already holds a Google refresh token, it can send it to:

- `POST /api/oauth/providers/token`

The payload must include `hardware_id`, `user_id`, `provider=google`, and `refresh_token`.

# Multi-profile backend shape

The backend now uses a mirror-scoped profile model instead of a single global user. A physical mirror authenticates itself with a hardware identity, then the backend resolves exactly one active enrolled profile for widget and OAuth-backed data requests.

## Data model

The current implementation is designed to map cleanly onto the requested D1 schema:

- `mirrors`
  - `id`
  - `hardware_id` (unique)
  - `friendly_name`
  - `hardware_token_hash`
- `user_profiles`
  - `id`
  - `mirror_id`
  - `user_id`
  - `display_name`
  - `widget_config`
  - `is_active`
- `oauth_credentials`
  - `id`
  - `mirror_id`
  - `user_id`
  - `provider` (`google` only)
  - encrypted token fields and scopes
- `widget_config`
  - mirror-scoped and user-scoped widget rows
- `user_settings`
  - mirror-scoped and user-scoped display settings
- `clothing_item`
  - scoped by `user_id` so wardrobe data stays private per profile

## Session handshake

The mirror-side handshake is:

1. `POST /api/mirror/register`
2. Persist returned `hardware_token` on device
3. Call `GET /api/mirror/sync` with:
   - `X-Mirror-Hardware-Id`
   - `X-Mirror-Hardware-Token`
   - optional `X-Mirror-User-Id`

`GET /api/mirror/sync` returns:

- mirror identity
- active enrolled profile
- widget configuration for that profile
- user settings for that profile

If the mirror supplies an explicit `user_id` that is not the active enrolled profile, the backend rejects the request.

## Profile switching and enrollment

Implemented routes:

- `GET /api/profile/`
- `POST /api/profile/enroll`
- `POST /api/profile/activate`
- `DELETE /api/profile/{user_id}`

`POST /api/profile/activate` is the profile switch handshake. It marks the target user active for that mirror and clears `is_active` for the others. If the active profile is deleted, the backend automatically promotes another remaining enrolled profile when possible.

## OAuth-backed widget proxy

Google OAuth is now mirror-safe and profile-safe:

- OAuth is Google-only
- the backend stores refresh tokens in `oauth_credentials`
- the mirror UI requests filtered widget data from:
  - `GET /api/widgets/gmail`
  - `GET /api/widgets/calendar`

The device never stores or receives the raw Google refresh token. The backend refreshes access behind the scenes and returns only widget JSON shaped for the mirror UI.

## Privacy firewall

The active-session privacy rules are:

- mirror sync and widget proxy routes require a valid hardware token
- credential lookups are resolved through `mirror_id + active user_id`
- requesting another enrolled user's data returns `403`
- clothing and settings are resolved against the active mirror/profile context

When a user is removed from a mirror:

- their `user_profiles` row is deleted for that mirror
- backend cleanup revokes Google credentials for that mirror/user pair
- wardrobe cache rows for that user are removed locally
- Cloudinary cleanup can remain an optional follow-up step

## Local SQLite and D1

This repo still uses local SQLite on the mirror as the immediate control database. That remains the pragmatic bridge to the requested D1-backed architecture:

- SQLite is the fast local cache for the Pi runtime
- the data model now matches the intended mirror/profile/tokens layout
- D1 sync can mirror the same entities without changing the mirror UI contract

That means the device flow is already shaped around the shared-gateway model even before the cloud worker is fully finalized.

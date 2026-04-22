# Graph Report - Smart-Mirror  (2026-04-21)

## Corpus Check
- 159 files · ~124,199 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 816 nodes · 1476 edges · 35 communities detected
- Extraction: 68% EXTRACTED · 32% INFERRED · 0% AMBIGUOUS · INFERRED: 476 edges (avg confidence: 0.72)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 101|Community 101]]
- [[_COMMUNITY_Community 102|Community 102]]
- [[_COMMUNITY_Community 103|Community 103]]
- [[_COMMUNITY_Community 104|Community 104]]

## God Nodes (most connected - your core abstractions)
1. `resolve_active_profile_context()` - 32 edges
2. `D1SyncService` - 28 edges
3. `jsonRequest()` - 27 edges
4. `ButtonId` - 24 edges
5. `json()` - 22 edges
6. `ButtonAction` - 20 edges
7. `ButtonEvent` - 18 edges
8. `AuthManager` - 17 edges
9. `GoogleProvider` - 15 edges
10. `Buttons` - 15 edges

## Surprising Connections (you probably didn't know these)
- `delete_user_settings()` --calls--> `resolve_active_profile_context()`  [INFERRED]
  backend\api\user.py → backend\services\user_service.py
- `enroll_profile()` --calls--> `get_mirror_by_hardware_id()`  [INFERRED]
  backend\api\user.py → backend\services\user_service.py
- `activate_profile()` --calls--> `get_mirror_by_hardware_id()`  [INFERRED]
  backend\api\user.py → backend\services\user_service.py
- `ClothingItem` --calls--> `create_clothing_item()`  [INFERRED]
  backend\database\models.py → backend\services\clothing_service.py
- `get_oauth_public_base_url()` --calls--> `start_login()`  [INFERRED]
  backend\config.py → backend\api\auth.py

## Communities

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (44): Base, create_checkpoint(), _parse_dt(), Simple last-write-wins policy using updated timestamps., remote_wins(), _checkpoint_cursor_iso(), _classify_sqlite_operational_error(), D1SyncService (+36 more)

### Community 1 - "Community 1"
Cohesion: 0.06
Nodes (41): get_camera_mjpeg_live(), get_camera_mjpeg_stream(), get_camera_status(), _mjpeg_streaming_response(), post_camera_capture(), post_camera_preview_start(), post_camera_preview_stop(), CameraCaptureState (+33 more)

### Community 2 - "Community 2"
Cohesion: 0.06
Nodes (50): CalendarEventOut, CalendarEventsResponse, CalendarManualCreate, CalendarManualUpdate, CalendarTasksResponse, create_manual(), delete_manual(), _fetch_google_events() (+42 more)

### Community 3 - "Community 3"
Cohesion: 0.08
Nodes (39): AuthStatusOut, DeviceCodeOut, ProviderStatusOut, Polling response for an in-progress device-code flow., Status of a single connected (or disconnected) provider., Returned when a device-code login flow is initiated., BaseModel, CameraCaptureRequest (+31 more)

### Community 4 - "Community 4"
Cohesion: 0.11
Nodes (31): _effect_name(), emit_dev_event(), handle_button_event(), iter_button_events(), Apply backend-side effects for a button event.     `effect` remains a compatibi, Local development hook: inject synthetic events without GPIO., _resolve_capture_button(), _resolve_semantics() (+23 more)

### Community 5 - "Community 5"
Cohesion: 0.08
Nodes (29): ABC, CalendarProvider, DeviceCodeResponse, NormalizedEvent, Abstract base for calendar/task providers., Provider-agnostic event/task consumed by sync_service and widgets., Each provider must implement these methods.  All HTTP calls use httpx     so th, Best-effort token revocation hook for provider cleanup. (+21 more)

### Community 6 - "Community 6"
Cohesion: 0.1
Nodes (22): cancel_login(), list_providers(), login_status(), logout(), AuthManager, _credential_key(), _credential_row(), start_login() (+14 more)

### Community 7 - "Community 7"
Cohesion: 0.12
Nodes (17): DeviceConnectionManager, DeviceState, _envelope(), Full SEARCHING -> CONNECTING -> CONNECTED flow triggered by a real         comp, Walk through SEARCHING -> CONNECTING -> CONNECTED (or ERROR)., Single-device connection authority.  Only one device may be active at a     tim, dev_device_connect(), dev_device_disconnect() (+9 more)

### Community 8 - "Community 8"
Cohesion: 0.12
Nodes (31): readActiveMirrorUserId(), readMirrorHardwareId(), readMirrorHardwareToken(), readStorage(), saveActiveMirrorUserId(), saveMirrorHardwareId(), saveMirrorHardwareToken(), writeStorage() (+23 more)

### Community 9 - "Community 9"
Cohesion: 0.09
Nodes (29): delete_user_clothing_cache(), activate_profile(), delete_profile(), delete_user_settings(), enroll_profile(), get_user_settings(), list_profiles(), mirror_sync() (+21 more)

### Community 10 - "Community 10"
Cohesion: 0.12
Nodes (21): clear_person_images(), _delete_all_rows_and_files(), get_latest_person_image(), get_person_image_by_id(), resolve_safe_image_path(), _resolved_person_images_dir(), save_person_image(), set_latest_person_image_path() (+13 more)

### Community 11 - "Community 11"
Cohesion: 0.14
Nodes (19): closeMenuOverlay(), createPendingAccountUserId(), cycleAnimation(), handleActivateProfile(), handleButtonInput(), handleCreateAccount(), handleIdentitySelect(), handleMenuBack() (+11 more)

### Community 12 - "Community 12"
Cohesion: 0.18
Nodes (23): compareTimestamp(), d1ExceptionResponse(), fetch(), isAuthorized(), json(), parseBearerToken(), pullRows(), pushRows() (+15 more)

### Community 13 - "Community 13"
Cohesion: 0.1
Nodes (11): useAuthState(), useCalendarEvents(), useCalendarFeed(), useCalendarTasks(), formatReceivedLabel(), mapItem(), useEmailMessages(), useIntervalWhen() (+3 more)

### Community 14 - "Community 14"
Cohesion: 0.19
Nodes (14): inferWidgetSizePreset(), baseType(), clampFreeform(), dedupeWidgetRows(), defaultFreeformForType(), legacyPixelsToPercent(), looksLikeLegacyPixel(), normalizeFreeform() (+6 more)

### Community 15 - "Community 15"
Cohesion: 0.22
Nodes (14): _cache_key(), fetch_weather_snapshot(), get_weather_snapshot(), _api_key(), _map_condition_code(), _parse_forecast(), WeatherAPI.com client — https://www.weatherapi.com/docs/ Uses forecast.json (in, Map WeatherAPI condition.code to mirror UI keys (WeatherIcons.tsx).     See htt (+6 more)

### Community 16 - "Community 16"
Cohesion: 0.33
Nodes (8): _cloudflared_config_path(), _cloudflared_hostnames(), get_db_path(), get_oauth_public_base_url(), get_sqlalchemy_database_url(), Resolve the SQLite database path.     Uses MIRROR_DB_PATH or DATABASE_URL if pro, Build the SQLAlchemy SQLite URL for the local DB., _sqlite_local_db_is_readonly()

### Community 17 - "Community 17"
Cohesion: 0.22
Nodes (5): Pydantic models for WebSocket SYNC_STATE (config UI → mirror)., Plain dicts for persistence (matches _upsert_remote_widgets expectations)., One widget in SYNC_STATE.widgets (layout in percent of mirror canvas)., sync_widgets_as_dicts(), SyncWidgetItem

### Community 18 - "Community 18"
Cohesion: 0.22
Nodes (2): Legacy sync manager retained as a lightweight no-op shim.  The multi-profile b, SyncManager

### Community 19 - "Community 19"
Cohesion: 0.22
Nodes (3): resolveCalendarPageSize(), resolveEmailPageSize(), estimatePageSize()

### Community 20 - "Community 20"
Cohesion: 0.46
Nodes (6): formatDayLabel(), formatDetailLabel(), formatTime(), formatTimeRange(), parseStartMs(), toCalendarEventDisplay()

### Community 21 - "Community 21"
Cohesion: 0.32
Nodes (5): getApiBase(), getConfiguredBackendOrigin(), getWebSocketUrl(), useControlEvents(), useReconnectingWebSocket()

### Community 22 - "Community 22"
Cohesion: 0.38
Nodes (4): normalizeIndex(), profileInitials(), profileLabel(), TactileRail()

### Community 23 - "Community 23"
Cohesion: 0.5
Nodes (2): health_d1(), Calls the worker ``GET /health`` with the same bearer token used for sync.

### Community 28 - "Community 28"
Cohesion: 0.83
Nodes (3): parseControlEvent(), parseDevicePayload(), readNumber()

### Community 29 - "Community 29"
Cohesion: 0.67
Nodes (2): detectAutoPerformanceMode(), readReducedMotionState()

### Community 52 - "Community 52"
Cohesion: 1.0
Nodes (1): Start the device-code grant; return URI + code for QR display.

### Community 53 - "Community 53"
Cohesion: 1.0
Nodes (1): Block (with sleeps) until the user authorizes or the code expires.         Rais

### Community 54 - "Community 54"
Cohesion: 1.0
Nodes (1): Exchange a refresh token for a new access + refresh pair.

### Community 55 - "Community 55"
Cohesion: 1.0
Nodes (1): Return upcoming calendar events normalized to NormalizedEvent.

### Community 56 - "Community 56"
Cohesion: 1.0
Nodes (1): Return tasks/reminders normalized to NormalizedEvent.

### Community 101 - "Community 101"
Cohesion: 1.0
Nodes (1): Polling response for an in-progress device-code flow.

### Community 102 - "Community 102"
Cohesion: 1.0
Nodes (1): Status of a single connected (or disconnected) provider.

### Community 103 - "Community 103"
Cohesion: 1.0
Nodes (1): Resolve the SQLite database path.     Uses MIRROR_DB_PATH or DATABASE_URL if pro

### Community 104 - "Community 104"
Cohesion: 1.0
Nodes (1): Build the SQLAlchemy SQLite URL for the local DB.

## Knowledge Gaps
- **51 isolated node(s):** `Resolve the SQLite database path.     Uses MIRROR_DB_PATH or DATABASE_URL if pro`, `Build the SQLAlchemy SQLite URL for the local DB.`, `Calls the worker ``GET /health`` with the same bearer token used for sync.`, `Initialize database tables for Phase 1.     This uses SQLAlchemy's create_all f`, `Add D1 cursor columns to d1_sync_checkpoint for existing SQLite DBs.` (+46 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 18`** (9 nodes): `sync_service.py`, `Legacy sync manager retained as a lightweight no-op shim.  The multi-profile b`, `SyncManager`, `.force_sync()`, `.get_last_sync()`, `.start_all()`, `.start_provider_sync()`, `.stop_all()`, `.stop_provider_sync()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 23`** (4 nodes): `health.py`, `health()`, `health_d1()`, `Calls the worker ``GET /health`` with the same bearer token used for sync.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 29`** (4 nodes): `useReducedMotion.ts`, `detectAutoPerformanceMode()`, `readReducedMotionState()`, `useReducedMotion()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 52`** (1 nodes): `Start the device-code grant; return URI + code for QR display.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 53`** (1 nodes): `Block (with sleeps) until the user authorizes or the code expires.         Rais`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 54`** (1 nodes): `Exchange a refresh token for a new access + refresh pair.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 55`** (1 nodes): `Return upcoming calendar events normalized to NormalizedEvent.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 56`** (1 nodes): `Return tasks/reminders normalized to NormalizedEvent.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 101`** (1 nodes): `Polling response for an in-progress device-code flow.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 102`** (1 nodes): `Status of a single connected (or disconnected) provider.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 103`** (1 nodes): `Resolve the SQLite database path.     Uses MIRROR_DB_PATH or DATABASE_URL if pro`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 104`** (1 nodes): `Build the SQLAlchemy SQLite URL for the local DB.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `json()` connect `Community 12` to `Community 0`, `Community 1`, `Community 2`, `Community 5`, `Community 8`, `Community 15`?**
  _High betweenness centrality (0.087) - this node is a cross-community bridge._
- **Why does `jsonRequest()` connect `Community 8` to `Community 12`?**
  _High betweenness centrality (0.057) - this node is a cross-community bridge._
- **Why does `resolve_active_profile_context()` connect `Community 2` to `Community 9`?**
  _High betweenness centrality (0.046) - this node is a cross-community bridge._
- **Are the 35 inferred relationships involving `str` (e.g. with `create_app()` and `start_login()`) actually correct?**
  _`str` has 35 INFERRED edges - model-reasoned connections that need verification._
- **Are the 29 inferred relationships involving `resolve_active_profile_context()` (e.g. with `get_events()` and `get_tasks()`) actually correct?**
  _`resolve_active_profile_context()` has 29 INFERRED edges - model-reasoned connections that need verification._
- **Are the 8 inferred relationships involving `D1SyncService` (e.g. with `ClothingImage` and `ClothingItem`) actually correct?**
  _`D1SyncService` has 8 INFERRED edges - model-reasoned connections that need verification._
- **Are the 26 inferred relationships involving `jsonRequest()` (e.g. with `readMirrorHardwareId()` and `readMirrorHardwareToken()`) actually correct?**
  _`jsonRequest()` has 26 INFERRED edges - model-reasoned connections that need verification._
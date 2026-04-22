# Sync + D1 Acceptance Audit - 2026-04-21

## Scope
- Verify local sync logic and table orchestration in `backend/services/d1_sync.py`.
- Verify Cloudflare Worker acceptance logic for sync tables in `deploy/worker/src/index.ts`.
- Verify migration support in `deploy/worker/migrations/0001_init.sql`.
- Confirm how a new sync table is accepted end-to-end.

## Runtime Evidence
- During backend startup with D1 sync enabled, logs immediately show:
  - `D1 push failed for mirrors: ... "error_code":"INVALID_TABLE"`
  - `D1 pull failed for mirrors: ... "error_code":"INVALID_TABLE"`
  - `D1 push failed for user_profiles: ... "error_code":"INVALID_TABLE"`
  - `D1 pull failed for user_profiles: ... "error_code":"INVALID_TABLE"`
- `GET /api/health/d1` still returns `200` because worker reachability is healthy even when table acceptance fails.

## Source-of-Truth Checks

### Local sync table registry
From `backend/services/d1_sync.py`:
- `TABLE_MODELS` and `TABLE_ORDER` include:
  - `mirrors`
  - `user_profiles`
  - `widget_config`
  - `user_settings`
  - `oauth_credentials`
  - `clothing_item`
  - `clothing_image`

### Worker acceptance allowlist
From `deploy/worker/src/index.ts`:
- `TABLE_SCHEMAS` includes only:
  - `widget_config`
  - `user_settings`
  - `clothing_item`
  - `clothing_image`
- For unknown tables, worker returns `400` with `error_code: "INVALID_TABLE"` in `/sync/push`, `/sync/pull`, and `/sync/stats`.

### Worker migrations
From `deploy/worker/migrations/0001_init.sql`:
- Creates only:
  - `widget_config`
  - `user_settings`
  - `clothing_item`
  - `clothing_image`

## Mismatch Matrix

| Table | In Python `TABLE_ORDER` | In Worker `TABLE_SCHEMAS` | In D1 Migration | Result |
|---|---|---|---|---|
| `mirrors` | Yes | No | No | Fails with `INVALID_TABLE` |
| `user_profiles` | Yes | No | No | Fails with `INVALID_TABLE` |
| `oauth_credentials` | Yes | No | No | Will fail with `INVALID_TABLE` when reached |
| `widget_config` | Yes | Yes | Yes | Accepted |
| `user_settings` | Yes | Yes | Yes | Accepted |
| `clothing_item` | Yes | Yes | Yes | Accepted |
| `clothing_image` | Yes | Yes | Yes | Accepted |

## How the Worker Accepts a New Sync Table
The acceptance path is explicit and static (not dynamic):
1. Add table schema entry to `TABLE_SCHEMAS` in `deploy/worker/src/index.ts` with `columns` and `orderColumn`.
2. Add D1 migration SQL to create the table (and indexes/constraints as needed).
3. Ensure Python sync engine includes the table in:
   - `TABLE_MODELS`
   - `TABLE_ORDER`
   - `_serialize_row`
   - `_apply_incoming_row`
   - order/cursor helpers if non-default order column behavior is required.
4. Deploy Worker with migration applied.

If any one of these is missing, sync will reject or drift.

## New Table Onboarding Checklist
- [ ] Add SQLAlchemy model and local DB support.
- [ ] Add table to `D1SyncService.TABLE_MODELS`.
- [ ] Add table to `D1SyncService.TABLE_ORDER`.
- [ ] Implement table mapping in `_serialize_row`.
- [ ] Implement incoming merge mapping in `_apply_incoming_row`.
- [ ] Validate cursor/order behavior (`_order_column_attr`, `_order_value_raw_from_payload`) when not using `updated_at`.
- [ ] Add schema entry in Worker `TABLE_SCHEMAS`.
- [ ] Add D1 migration (`CREATE TABLE`, indexes, constraints).
- [ ] Deploy worker and apply migration.
- [ ] Verify `/sync/stats?table=<name>` returns `200`.
- [ ] Verify `/sync/push` returns accepted/skipped IDs as expected.
- [ ] Verify `/sync/pull` incremental cursor progression and full pull behavior.

## Priority Fixes
1. Align table contracts now: either remove unsupported tables from Python `TABLE_ORDER` or add them to Worker schema + migrations.
2. Add a startup guard that compares Python table set vs worker-accepted table set and logs a single actionable mismatch warning.
3. Add a CI check that validates table-set parity across:
   - Python sync registry
   - Worker `TABLE_SCHEMAS`
   - Migration DDL coverage

type RowRecord = Record<string, unknown>;

type D1ExecOutcome = {
  success?: boolean;
  error?: unknown;
  meta?: unknown;
  results?: unknown;
};

type D1PreparedStatement = {
  bind: (...values: unknown[]) => D1PreparedStatement;
  first: <T = RowRecord>() => Promise<T | null>;
  all: <T = RowRecord>() => Promise<{ results?: T[] } & D1ExecOutcome>;
  run: () => Promise<D1ExecOutcome>;
};

type D1DatabaseLike = {
  prepare: (query: string) => D1PreparedStatement;
};

interface Env {
  MIRROR_DB: D1DatabaseLike;
  MIRROR_SYNC_TOKEN: string;
}

type TableSchema = {
  columns: string[];
  keyField: string;
  orderColumn: string;
  scopeColumn: string;
};

const TABLE_SCHEMAS: Record<string, TableSchema> = {
  mirrors: {
    columns: [
      "id",
      "hardware_id",
      "friendly_name",
      "claimed_by_user_uid",
      "claimed_at",
      "created_at",
      "updated_at",
      "synced_at",
    ],
    keyField: "id",
    orderColumn: "updated_at",
    scopeColumn: "id",
  },
  user_profiles: {
    columns: [
      "id",
      "sync_id",
      "mirror_id",
      "user_id",
      "display_name",
      "widget_config",
      "is_active",
      "created_at",
      "updated_at",
      "deleted_at",
      "synced_at",
    ],
    keyField: "sync_id",
    orderColumn: "updated_at",
    scopeColumn: "mirror_id",
  },
  widget_config: {
    columns: [
      "id",
      "sync_id",
      "mirror_id",
      "user_id",
      "widget_id",
      "enabled",
      "position_row",
      "position_col",
      "size_rows",
      "size_cols",
      "config_json",
      "created_at",
      "updated_at",
      "deleted_at",
      "synced_at",
    ],
    keyField: "sync_id",
    orderColumn: "updated_at",
    scopeColumn: "mirror_id",
  },
  user_settings: {
    columns: [
      "id",
      "sync_id",
      "mirror_id",
      "user_id",
      "theme",
      "primary_font_size",
      "accent_color",
      "created_at",
      "updated_at",
      "deleted_at",
      "synced_at",
    ],
    keyField: "sync_id",
    orderColumn: "updated_at",
    scopeColumn: "mirror_id",
  },
};

type ExistingRowMatch = {
  recordId: string | number;
  row: RowRecord;
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function unauthorized(): Response {
  return json({ error: "unauthorized" }, 401);
}

function parseBearerToken(authHeader: string | null): string {
  if (!authHeader) {
    return "";
  }
  const trimmed = authHeader.trim();
  if (!/^Bearer\s+/i.test(trimmed)) {
    return "";
  }
  return trimmed.replace(/^Bearer\s+/i, "").trim();
}

function isAuthorized(request: Request, env: Env): boolean {
  const token = parseBearerToken(request.headers.get("Authorization"));
  const expected = String(env.MIRROR_SYNC_TOKEN ?? "").trim();
  return Boolean(token && expected && token === expected);
}

function sanitizeRow(input: unknown, schema: TableSchema): RowRecord {
  const source = (typeof input === "object" && input !== null ? input : {}) as RowRecord;
  const nowIso = new Date().toISOString();
  const out: RowRecord = {};
  for (const column of schema.columns) {
    if (column in source) {
      out[column] = source[column];
    }
  }
  if (typeof out.config_json === "object" && out.config_json !== null) {
    out.config_json = JSON.stringify(out.config_json);
  }
  if (typeof out.widget_config === "object" && out.widget_config !== null) {
    out.widget_config = JSON.stringify(out.widget_config);
  }
  out.synced_at = nowIso;
  return out;
}

function compareTimestamp(a: unknown, b: unknown): number {
  const aTs = Date.parse(String(a ?? ""));
  const bTs = Date.parse(String(b ?? ""));
  if (!Number.isFinite(aTs) || !Number.isFinite(bTs)) {
    return Number.NaN;
  }
  return aTs - bTs;
}

function requireMirrorId(url: URL): string | null {
  const mirrorId = String(url.searchParams.get("mirror_id") || "").trim();
  return mirrorId || null;
}

function keyValue(row: RowRecord, schema: TableSchema): string {
  return String(row[schema.keyField] ?? "").trim();
}

function scopeMatches(row: RowRecord, schema: TableSchema, mirrorId: string): boolean {
  const value = String(row[schema.scopeColumn] ?? "").trim();
  return Boolean(value) && value === mirrorId;
}

function scopedPullQuery(table: string, schema: TableSchema, full: boolean): string {
  if (full) {
    return `SELECT * FROM ${table} WHERE ${schema.scopeColumn} = ? ORDER BY ${schema.orderColumn} ASC, ${schema.keyField} ASC`;
  }
  return `SELECT * FROM ${table} WHERE ${schema.scopeColumn} = ? AND ${schema.orderColumn} >= ? ORDER BY ${schema.orderColumn} ASC, ${schema.keyField} ASC`;
}

async function pullRows(
  env: Env,
  table: string,
  since: string,
  full: boolean,
  mirrorId: string,
): Promise<Response> {
  const schema = TABLE_SCHEMAS[table];
  if (!schema) {
    return json({ error: "invalid table", error_code: "INVALID_TABLE", table, op: "pull" }, 400);
  }
  if (!full && !Number.isFinite(Date.parse(since))) {
    return json({ error: "invalid since timestamp", error_code: "INVALID_SINCE", table, op: "pull" }, 400);
  }
  const query = scopedPullQuery(table, schema, full);
  let result: { results?: RowRecord[] } & D1ExecOutcome;
  try {
    result = full
      ? await env.MIRROR_DB.prepare(query).bind(mirrorId).all<RowRecord>()
      : await env.MIRROR_DB.prepare(query).bind(mirrorId, new Date(Date.parse(since)).toISOString()).all<RowRecord>();
  } catch (error) {
    return json(
      {
        error: "d1_query_exception",
        error_code: "D1_PULL_EXCEPTION",
        table,
        op: "pull",
        detail: String(error),
      },
      500,
    );
  }
  if (result.success === false) {
    return json(
      {
        error: "d1_query_failed",
        error_code: "D1_QUERY_FAILED",
        table,
        op: "pull",
        detail: result.error ?? result.meta ?? result,
      },
      500,
    );
  }
  return json({ table, full, mirror_id: mirrorId, rows: result.results ?? [] });
}

async function tableStats(env: Env, table: string, mirrorId: string): Promise<Response> {
  const schema = TABLE_SCHEMAS[table];
  if (!schema) {
    return json({ error: "invalid table", error_code: "INVALID_TABLE", table, op: "stats" }, 400);
  }
  let countResult: { results?: { n: number }[] } & D1ExecOutcome;
  try {
    countResult = await env.MIRROR_DB.prepare(
      `SELECT COUNT(*) as n FROM ${table} WHERE ${schema.scopeColumn} = ?`,
    )
      .bind(mirrorId)
      .all<{ n: number }>();
  } catch (error) {
    return json(
      {
        error: "d1_stats_failed",
        error_code: "D1_STATS_COUNT_EXCEPTION",
        table,
        op: "stats",
        detail: String(error),
      },
      500,
    );
  }
  let maxResult: { results?: { m: unknown }[] } & D1ExecOutcome;
  try {
    maxResult = await env.MIRROR_DB.prepare(
      `SELECT MAX(${schema.orderColumn}) as m FROM ${table} WHERE ${schema.scopeColumn} = ?`,
    )
      .bind(mirrorId)
      .all<{ m: unknown }>();
  } catch (error) {
    return json(
      {
        error: "d1_stats_failed",
        error_code: "D1_STATS_MAX_EXCEPTION",
        table,
        op: "stats",
        detail: String(error),
      },
      500,
    );
  }
  if (countResult.success === false || maxResult.success === false) {
    return json(
      {
        error: "d1_stats_failed",
        error_code: "D1_STATS_FAILED",
        table,
        op: "stats",
        detail: countResult.error ?? maxResult.error ?? countResult.meta ?? maxResult.meta,
      },
      500,
    );
  }
  return json({
    table,
    mirror_id: mirrorId,
    count: Number(countResult.results?.[0]?.n ?? 0),
    max_order: maxResult.results?.[0]?.m ?? null,
    order_column: schema.orderColumn,
  });
}

async function findExistingRow(
  env: Env,
  table: string,
  row: RowRecord,
  mirrorId: string,
): Promise<ExistingRowMatch | null> {
  const schema = TABLE_SCHEMAS[table];
  const key = keyValue(row, schema);
  if (table === "mirrors") {
    if (key) {
      const byId = await env.MIRROR_DB.prepare(`SELECT * FROM mirrors WHERE id = ?`).bind(key).first<RowRecord>();
      if (byId) {
        return { recordId: key, row: byId };
      }
    }
    const hardwareId = String(row.hardware_id ?? "").trim();
    if (!hardwareId) {
      return null;
    }
    const byHardware = await env.MIRROR_DB.prepare(`SELECT * FROM mirrors WHERE hardware_id = ?`)
      .bind(hardwareId)
      .first<RowRecord>();
    return byHardware ? { recordId: String(byHardware.id ?? hardwareId), row: byHardware } : null;
  }

  if (key) {
    const bySyncId = await env.MIRROR_DB.prepare(`SELECT * FROM ${table} WHERE sync_id = ?`).bind(key).first<RowRecord>();
    if (bySyncId) {
      return { recordId: Number(bySyncId.id), row: bySyncId };
    }
  }

  if (table === "user_profiles" || table === "user_settings") {
    const logical = await env.MIRROR_DB.prepare(`SELECT * FROM ${table} WHERE mirror_id = ? AND user_id = ?`)
      .bind(mirrorId, String(row.user_id ?? ""))
      .first<RowRecord>();
    return logical ? { recordId: Number(logical.id), row: logical } : null;
  }

  const logical = await env.MIRROR_DB.prepare(
    `SELECT * FROM widget_config WHERE mirror_id = ? AND user_id = ? AND widget_id = ?`,
  )
    .bind(mirrorId, String(row.user_id ?? ""), String(row.widget_id ?? ""))
    .first<RowRecord>();
  return logical ? { recordId: Number(logical.id), row: logical } : null;
}

function nonPrimaryColumns(schema: TableSchema): string[] {
  return schema.columns.filter((column) => !(schema.scopeColumn === "id" && column === "id") && column !== "id");
}

async function updateExistingRow(
  env: Env,
  table: string,
  schema: TableSchema,
  row: RowRecord,
  recordId: string | number,
): Promise<D1ExecOutcome> {
  const columns = nonPrimaryColumns(schema);
  const assignments = columns.map((column) => `${column} = ?`).join(", ");
  const whereField = table === "mirrors" ? "id" : "id";
  const values = columns.map((column) => row[column] ?? null);
  return env.MIRROR_DB.prepare(`UPDATE ${table} SET ${assignments} WHERE ${whereField} = ?`)
    .bind(...values, recordId)
    .run();
}

async function insertNewRow(
  env: Env,
  table: string,
  schema: TableSchema,
  row: RowRecord,
): Promise<D1ExecOutcome> {
  const columns =
    table === "mirrors" ? schema.columns : schema.columns.filter((column) => column !== "id");
  const placeholders = columns.map(() => "?").join(", ");
  const values = columns.map((column) => row[column] ?? null);
  return env.MIRROR_DB.prepare(`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`)
    .bind(...values)
    .run();
}

async function pushRows(env: Env, table: string, mirrorId: string, body: unknown): Promise<Response> {
  const schema = TABLE_SCHEMAS[table];
  if (!schema) {
    return json({ error: "invalid table", error_code: "INVALID_TABLE", table, op: "push" }, 400);
  }
  const payload = (typeof body === "object" && body !== null ? body : {}) as { rows?: unknown[] };
  const rows = Array.isArray(payload.rows) ? payload.rows : [];

  const conflicts: Array<Record<string, unknown>> = [];
  const acceptedKeys: string[] = [];
  const skippedKeys: string[] = [];
  let insertedOrUpdated = 0;
  let skipped = 0;

  try {
    for (const rawRow of rows) {
      const row = sanitizeRow(rawRow, schema);
      if (!scopeMatches(row, schema, mirrorId)) {
        skipped += 1;
        continue;
      }

      const key = keyValue(row, schema);
      if (!key) {
        skipped += 1;
        continue;
      }

      const existing = await findExistingRow(env, table, row, mirrorId);
      if (existing) {
        const incomingChangedAt = row.updated_at ?? row.created_at;
        const existingChangedAt = existing.row.updated_at ?? existing.row.created_at;
        const cmp = compareTimestamp(incomingChangedAt, existingChangedAt);
        if (!Number.isFinite(cmp)) {
          skipped += 1;
          skippedKeys.push(key);
          conflicts.push({
            key,
            winner: "remote",
            reason: "invalid_timestamp",
            incoming_updated_at: incomingChangedAt,
            remote_updated_at: existingChangedAt,
          });
          continue;
        }
        if (cmp < 0) {
          skipped += 1;
          skippedKeys.push(key);
          conflicts.push({
            key,
            winner: "remote",
            incoming_updated_at: incomingChangedAt,
            remote_updated_at: existingChangedAt,
          });
          continue;
        }
        if (cmp > 0) {
          conflicts.push({
            key,
            winner: "incoming",
            incoming_updated_at: incomingChangedAt,
            remote_updated_at: existingChangedAt,
          });
        }
        const runResult = await updateExistingRow(env, table, schema, row, existing.recordId);
        if (runResult.success === false) {
          return json(
            {
              error: "d1_update_failed",
              error_code: "D1_UPDATE_FAILED",
              table,
              op: "push",
              key,
              detail: runResult.error ?? runResult.meta ?? runResult,
            },
            500,
          );
        }
      } else {
        const runResult = await insertNewRow(env, table, schema, row);
        if (runResult.success === false) {
          return json(
            {
              error: "d1_insert_failed",
              error_code: "D1_INSERT_FAILED",
              table,
              op: "push",
              key,
              detail: runResult.error ?? runResult.meta ?? runResult,
            },
            500,
          );
        }
      }

      insertedOrUpdated += 1;
      acceptedKeys.push(key);
    }
  } catch (error) {
    return json(
      {
        error: "d1_push_exception",
        error_code: "D1_PUSH_EXCEPTION",
        table,
        op: "push",
        detail: String(error),
      },
      500,
    );
  }

  return json({
    table,
    mirror_id: mirrorId,
    accepted: insertedOrUpdated,
    skipped,
    accepted_keys: acceptedKeys,
    skipped_keys: skippedKeys,
    conflicts,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!isAuthorized(request, env)) {
      return unauthorized();
    }

    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ status: "ok" });
    }

    const mirrorId = requireMirrorId(url);
    if (!mirrorId) {
      return json({ error: "mirror_id is required" }, 400);
    }

    if (request.method === "GET" && url.pathname === "/sync/stats") {
      const table = String(url.searchParams.get("table") || "");
      return tableStats(env, table, mirrorId);
    }

    if (request.method === "GET" && url.pathname === "/sync/pull") {
      const table = String(url.searchParams.get("table") || "");
      const since = String(url.searchParams.get("since") || "");
      const fullParam = url.searchParams.get("full");
      const full = fullParam === "1" || fullParam === "true";
      return pullRows(env, table, since, full, mirrorId);
    }

    if (request.method === "POST" && url.pathname === "/sync/push") {
      const table = String(url.searchParams.get("table") || "");
      const body = await request.json().catch(() => null);
      if (!body) {
        return json({ error: "invalid json body" }, 400);
      }
      return pushRows(env, table, mirrorId, body);
    }

    return json({ error: "not found" }, 404);
  },
};

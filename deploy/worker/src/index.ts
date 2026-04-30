type RowRecord = Record<string, unknown>;

/** Subset of Cloudflare D1Result used for error checks. */
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
  orderColumn: string;
};

const TABLE_SCHEMAS: Record<string, TableSchema> = {
  widget_config: {
    columns: [
      "id",
      "widget_id",
      "enabled",
      "position_row",
      "position_col",
      "size_rows",
      "size_cols",
      "config_json",
      "created_at",
      "updated_at",
      "synced_at",
    ],
    orderColumn: "updated_at",
  },
  user_settings: {
    columns: [
      "id",
      "theme",
      "primary_font_size",
      "accent_color",
      "created_at",
      "updated_at",
      "synced_at",
    ],
    orderColumn: "updated_at",
  },
  clothing_item: {
    columns: [
      "id",
      "name",
      "category",
      "color",
      "season",
      "notes",
      "created_at",
      "updated_at",
      "synced_at",
    ],
    orderColumn: "updated_at",
  },
  clothing_image: {
    columns: [
      "id",
      "clothing_item_id",
      "storage_provider",
      "storage_key",
      "image_url",
      "created_at",
      "synced_at",
    ],
    orderColumn: "created_at",
  },
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
  const h = authHeader.trim();
  if (!/^Bearer\s+/i.test(h)) {
    return "";
  }
  // Everything after "Bearer " (avoids split bugs with multi-space or secrets that contain spaces).
  return h.replace(/^Bearer\s+/i, "").trim();
}

function isAuthorized(request: Request, env: Env): boolean {
  const token = parseBearerToken(request.headers.get("Authorization"));
  const expected = String(env.MIRROR_SYNC_TOKEN ?? "").trim();
  if (!token || !expected) {
    return false;
  }
  return token === expected;
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
  out.synced_at = nowIso;
  return out;
}

function compareTimestamp(a: unknown, b: unknown): number {
  const aTs = Date.parse(String(a ?? ""));
  const bTs = Date.parse(String(b ?? ""));
  if (!Number.isFinite(aTs) || !Number.isFinite(bTs)) {
    return 0;
  }
  return aTs - bTs;
}

async function pullRows(env: Env, table: string, since: string): Promise<Response> {
  const schema = TABLE_SCHEMAS[table];
  if (!schema) {
    return json({ error: "invalid table" }, 400);
  }
  const sinceTs = Date.parse(since);
  if (!Number.isFinite(sinceTs)) {
    return json({ error: "invalid since timestamp" }, 400);
  }
  const query = `SELECT * FROM ${table} WHERE ${schema.orderColumn} > ? ORDER BY ${schema.orderColumn} ASC`;
  const result = await env.MIRROR_DB.prepare(query).bind(new Date(sinceTs).toISOString()).all<RowRecord>();
  if (result.success === false) {
    return json(
      {
        error: "d1_query_failed",
        table,
        detail: result.error ?? result.meta ?? result,
      },
      500,
    );
  }
  return json({
    table,
    rows: result.results ?? [],
  });
}

async function pushRows(env: Env, body: unknown): Promise<Response> {
  const payload = (typeof body === "object" && body !== null ? body : {}) as {
    table?: string;
    rows?: unknown[];
  };
  const table = String(payload.table || "");
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const schema = TABLE_SCHEMAS[table];
  if (!schema) {
    return json({ error: "invalid table" }, 400);
  }

  const updatableColumns = schema.columns.filter((col) => col !== "id");
  const placeholders = schema.columns.map(() => "?").join(", ");
  const updates = updatableColumns.map((col) => `${col}=excluded.${col}`).join(", ");
  const upsertSql = `INSERT INTO ${table} (${schema.columns.join(", ")}) VALUES (${placeholders}) ON CONFLICT(id) DO UPDATE SET ${updates}`;

  const conflicts: Array<Record<string, unknown>> = [];
  let insertedOrUpdated = 0;
  let skipped = 0;

  try {
    for (const rawRow of rows) {
      const row = sanitizeRow(rawRow, schema);
      const id = Number(row.id);
      if (!Number.isFinite(id)) {
        continue;
      }
      row.id = id;

      const existing = await env.MIRROR_DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first<RowRecord>();
      if (existing) {
        const incomingChangedAt = row.updated_at ?? row.created_at;
        const existingChangedAt = existing.updated_at ?? existing.created_at;
        const cmp = compareTimestamp(incomingChangedAt, existingChangedAt);
        if (cmp < 0) {
          skipped += 1;
          conflicts.push({
            id,
            winner: "remote",
            incoming_updated_at: incomingChangedAt,
            remote_updated_at: existingChangedAt,
          });
          continue;
        }
        if (cmp > 0) {
          conflicts.push({
            id,
            winner: "incoming",
            incoming_updated_at: incomingChangedAt,
            remote_updated_at: existingChangedAt,
          });
        }
      }

      const values = schema.columns.map((column) => row[column] ?? null);
      const runResult = await env.MIRROR_DB.prepare(upsertSql).bind(...values).run();
      if (runResult.success === false) {
        return json(
          {
            error: "d1_upsert_failed",
            table,
            id,
            detail: runResult.error ?? runResult.meta ?? runResult,
          },
          500,
        );
      }
      insertedOrUpdated += 1;
    }
  } catch (err) {
    return json(
      {
        error: "d1_push_exception",
        table,
        detail: String(err),
      },
      500,
    );
  }

  return json({
    table,
    accepted: insertedOrUpdated,
    skipped,
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

    if (request.method === "GET" && url.pathname === "/sync/pull") {
      const table = String(url.searchParams.get("table") || "");
      const since = String(url.searchParams.get("since") || "");
      return pullRows(env, table, since);
    }

    if (request.method === "POST" && url.pathname === "/sync/push") {
      const body = await request.json().catch(() => null);
      if (!body) {
        return json({ error: "invalid json body" }, 400);
      }
      return pushRows(env, body);
    }

    return json({ error: "not found" }, 404);
  },
};

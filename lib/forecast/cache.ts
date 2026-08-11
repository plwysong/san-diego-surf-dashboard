type CacheState = "origin" | "fresh-cache" | "stale-cache";
type CacheRow = { payload: string | null; fetched_at: number; fresh_until: number; stale_until: number; refresh_lock_until: number; last_error: string | null };
type D1ResultLike = { meta?: { changes?: number }; results?: unknown[] };
type D1StatementLike = { bind(...values: unknown[]): D1StatementLike; run(): Promise<D1ResultLike>; first<T>(): Promise<T | null> };
type D1DatabaseLike = { prepare(query: string): D1StatementLike };
type ForecastPayload = Record<string, unknown> & { mode: "live" | "partial" | "unavailable" };

const CACHE_KEY = "san-diego-conditions-v11";
const FRESH_TTL_MS = 60 * 60 * 1000;
const STALE_TTL_MS = 36 * 60 * 60 * 1000;
const REFRESH_LEASE_MS = 45 * 1000;

async function durableCacheDb(): Promise<D1DatabaseLike | null> {
  const injected = (globalThis as typeof globalThis & { __FORECAST_CACHE_DB__?: D1DatabaseLike }).__FORECAST_CACHE_DB__;
  if (injected) return injected;
  try {
    const worker = await import("cloudflare:workers");
    return (worker.env as unknown as { DB?: D1DatabaseLike }).DB ?? null;
  } catch {
    return null;
  }
}

async function initializeCache(db: D1DatabaseLike) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS forecast_cache (
    cache_key TEXT PRIMARY KEY,
    payload TEXT,
    fetched_at INTEGER NOT NULL DEFAULT 0,
    fresh_until INTEGER NOT NULL DEFAULT 0,
    stale_until INTEGER NOT NULL DEFAULT 0,
    refresh_lock_until INTEGER NOT NULL DEFAULT 0,
    last_attempt_at INTEGER NOT NULL DEFAULT 0,
    last_error TEXT
  )`).run();
  await db.prepare("INSERT OR IGNORE INTO forecast_cache (cache_key) VALUES (?)").bind(CACHE_KEY).run();
}

async function readDurableCache(db: D1DatabaseLike) {
  return db.prepare("SELECT payload, fetched_at, fresh_until, stale_until, refresh_lock_until, last_error FROM forecast_cache WHERE cache_key = ?")
    .bind(CACHE_KEY).first<CacheRow>();
}

function parseCachedPayload(row: CacheRow | null): ForecastPayload | null {
  if (!row?.payload) return null;
  try {
    const value = JSON.parse(row.payload);
    return value && typeof value === "object" && ["live", "partial", "unavailable"].includes(value.mode)
      ? value as ForecastPayload
      : null;
  } catch {
    return null;
  }
}

function freshnessAdjustedPayload(payload: ForecastPayload, state: CacheState, storedAt: number) {
  if (state === "origin") return payload;
  const ageHours = Math.max(0, (Date.now() - storedAt) / 3_600_000);
  const penalty = state === "stale-cache" ? Math.min(40, Math.ceil(10 + ageHours)) : Math.min(8, Math.ceil(ageHours * 4));
  const adjust = (item: unknown) => {
    if (!item || typeof item !== "object") return item;
    const record = item as Record<string, unknown>;
    if (typeof record.confidenceScore !== "number") return item;
    const score = Math.max(0, Math.round(record.confidenceScore - penalty));
    const confidence = score >= 78 ? "High" : score >= 56 ? "Medium" : "Low";
    const freshnessReason = ageHours < 1 ? "stored forecast <1h old" : `stored forecast ${Math.round(ageHours)}h old`;
    return { ...record, confidenceScore: score, confidence, confidenceReason: record.confidenceReason ? `${record.confidenceReason} · ${freshnessReason}` : freshnessReason };
  };
  const conditions = Array.isArray(payload.conditions) ? payload.conditions.map(adjust) : payload.conditions;
  const dailyConditions = payload.dailyConditions && typeof payload.dailyConditions === "object"
    ? Object.fromEntries(Object.entries(payload.dailyConditions as Record<string, unknown>).map(([date, items]) => [date, Array.isArray(items) ? items.map(adjust) : items]))
    : payload.dailyConditions;
  return { ...payload, conditions, dailyConditions };
}

function payloadWithCache(payload: ForecastPayload, state: CacheState, storedAt: number, refreshError?: string) {
  const adjusted = freshnessAdjustedPayload(payload, state, storedAt);
  return {
    ...adjusted,
    cache: {
      state,
      storedAt: new Date(storedAt).toISOString(),
      ageSeconds: Math.max(0, Math.round((Date.now() - storedAt) / 1000)),
      ...(refreshError ? { refreshError } : {}),
    },
  };
}

async function claimRefreshLease(db: D1DatabaseLike, now: number) {
  const result = await db.prepare("UPDATE forecast_cache SET refresh_lock_until = ?, last_attempt_at = ? WHERE cache_key = ? AND refresh_lock_until < ?")
    .bind(now + REFRESH_LEASE_MS, now, CACHE_KEY, now).run();
  return Number(result.meta?.changes ?? 0) > 0;
}

async function storeDurablePayload(db: D1DatabaseLike, payload: ForecastPayload, now: number) {
  await db.prepare("UPDATE forecast_cache SET payload = ?, fetched_at = ?, fresh_until = ?, stale_until = ?, refresh_lock_until = 0, last_error = NULL WHERE cache_key = ?")
    .bind(JSON.stringify(payload), now, now + FRESH_TTL_MS, now + STALE_TTL_MS, CACHE_KEY).run();
}

async function releaseRefreshLease(db: D1DatabaseLike, message: string) {
  await db.prepare("UPDATE forecast_cache SET refresh_lock_until = 0, last_error = ? WHERE cache_key = ?")
    .bind(message.slice(0, 240), CACHE_KEY).run();
}

const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export function createForecastCache() {
  let cached: { freshUntil: number; staleUntil: number; storedAt: number; payload: ForecastPayload } | undefined;
  let negativeCache: { expires: number; payload: ForecastPayload } | undefined;
  let inFlight: Promise<ForecastPayload> | undefined;

  return async function respond(buildPayload: () => Promise<ForecastPayload>) {
    const now = Date.now();
    const cacheHeaders = (state: string, cacheControl = "private, no-store") => ({
      "Cache-Control": cacheControl,
      "X-Data-Cache": state,
    });
    if (cached && cached.freshUntil > now) {
      return Response.json(payloadWithCache(cached.payload, "fresh-cache", cached.storedAt), { headers: cacheHeaders("MEMORY-HIT") });
    }
    if (negativeCache && negativeCache.expires > now && !cached) {
      return Response.json(negativeCache.payload, { headers: { "Cache-Control": "no-store", "X-Data-Cache": "NEGATIVE-HIT" } });
    }

    let db: D1DatabaseLike | null = null;
    let durableRow: CacheRow | null = null;
    try {
      db = await durableCacheDb();
      if (db) {
        await initializeCache(db);
        durableRow = await readDurableCache(db);
        const durablePayload = parseCachedPayload(durableRow);
        if (durablePayload && durableRow && durableRow.fresh_until > now) {
          cached = { freshUntil: durableRow.fresh_until, staleUntil: durableRow.stale_until, storedAt: durableRow.fetched_at, payload: durablePayload };
          return Response.json(payloadWithCache(durablePayload, "fresh-cache", durableRow.fetched_at), { headers: cacheHeaders("DURABLE-HIT") });
        }
      }
    } catch (error) {
      console.error(`[conditions] durable cache read failed: ${error instanceof Error ? error.message : "unknown error"}`);
      db = null;
    }

    const durableStale = durableRow && durableRow.stale_until > now ? parseCachedPayload(durableRow) : null;
    const memoryStale = cached && cached.staleUntil > now ? cached.payload : null;
    const stalePayload = durableStale ?? memoryStale;
    const staleStoredAt = durableStale && durableRow ? durableRow.fetched_at : cached?.storedAt ?? now;

    if (db) {
      try {
        const ownsRefresh = await claimRefreshLease(db, now);
        if (!ownsRefresh) {
          if (stalePayload) {
            return Response.json(payloadWithCache(stalePayload, "stale-cache", staleStoredAt, durableRow?.last_error ?? "Refresh already in progress"), { headers: cacheHeaders("STALE-WHILE-REFRESH") });
          }
          for (let attempt = 0; attempt < 16; attempt++) {
            await delay(500);
            const waitingRow = await readDurableCache(db);
            const waitingPayload = parseCachedPayload(waitingRow);
            if (waitingPayload && waitingRow && waitingRow.stale_until > Date.now()) {
              const state: CacheState = waitingRow.fresh_until > Date.now() ? "fresh-cache" : "stale-cache";
              return Response.json(payloadWithCache(waitingPayload, state, waitingRow.fetched_at, waitingRow.last_error ?? undefined), { headers: cacheHeaders("DURABLE-WAIT-HIT") });
            }
          }
          const waitingPayload = { mode: "unavailable", generatedAt: new Date().toISOString(), conditions: [], zones: {}, providers: {}, sources: [], cache: { state: "origin", storedAt: new Date().toISOString(), ageSeconds: 0, refreshError: "Forecast refresh is still in progress" } };
          return Response.json(waitingPayload, { headers: cacheHeaders("REFRESH-IN-PROGRESS", "no-store") });
        }
      } catch (error) {
        console.error(`[conditions] durable refresh lease failed: ${error instanceof Error ? error.message : "unknown error"}`);
        db = null;
      }
    }

    try {
      inFlight ??= buildPayload().finally(() => { inFlight = undefined; });
      const payload = await inFlight;
      if (payload.mode !== "unavailable") {
        const storedAt = Date.now();
        cached = { freshUntil: storedAt + FRESH_TTL_MS, staleUntil: storedAt + STALE_TTL_MS, storedAt, payload };
        if (db) {
          try { await storeDurablePayload(db, payload, storedAt); }
          catch (error) { console.error(`[conditions] durable cache write failed: ${error instanceof Error ? error.message : "unknown error"}`); }
        }
        negativeCache = undefined;
        return Response.json(payloadWithCache(payload, "origin", storedAt), { headers: cacheHeaders("REFRESH") });
      }

      negativeCache = { expires: Date.now() + 20 * 1000, payload };
      const message = "No usable regional or CDIP nearshore forecast was available";
      if (db) {
        try { await releaseRefreshLease(db, message); }
        catch (error) { console.error(`[conditions] durable cache release failed: ${error instanceof Error ? error.message : "unknown error"}`); }
      }
      if (stalePayload) {
        return Response.json(payloadWithCache(stalePayload, "stale-cache", staleStoredAt, message), { headers: cacheHeaders("STALE-IF-ERROR") });
      }
      return Response.json(payload, { headers: cacheHeaders("MISS-UNAVAILABLE", "no-store") });
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      console.error(`[conditions] payload build failed: ${message}`);
      if (db) {
        try { await releaseRefreshLease(db, message); }
        catch (releaseError) { console.error(`[conditions] durable cache release failed: ${releaseError instanceof Error ? releaseError.message : "unknown error"}`); }
      }
      if (stalePayload) {
        return Response.json(payloadWithCache(stalePayload, "stale-cache", staleStoredAt, message), { headers: cacheHeaders("STALE-IF-ERROR") });
      }
      return Response.json({ mode: "unavailable", generatedAt: new Date().toISOString(), conditions: [], zones: {}, providers: {}, sources: [] }, { status: 200, headers: { "Cache-Control": "no-store" } });
    }
  };
}

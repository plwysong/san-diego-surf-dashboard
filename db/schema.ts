import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const forecastCache = sqliteTable("forecast_cache", {
  cacheKey: text("cache_key").primaryKey(),
  payload: text("payload"),
  fetchedAt: integer("fetched_at").notNull().default(0),
  freshUntil: integer("fresh_until").notNull().default(0),
  staleUntil: integer("stale_until").notNull().default(0),
  refreshLockUntil: integer("refresh_lock_until").notNull().default(0),
  lastAttemptAt: integer("last_attempt_at").notNull().default(0),
  lastError: text("last_error"),
});

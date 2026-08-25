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

/**
 * One row per successfully built forecast run.
 *
 * CDIP publishes no archive of past MOP forecast runs, so a run that is not
 * stored here cannot be recovered. Buoy-initialised truth for the same hours
 * stays available from CDIP for years, which makes the prediction side the
 * perishable half of any later verification.
 */
export const forecastHistory = sqliteTable("forecast_history", {
  issuedAt: integer("issued_at").primaryKey(),
  mode: text("mode").notNull(),
  payload: text("payload").notNull(),
});

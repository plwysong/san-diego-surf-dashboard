/**
 * Cloudflare bindings this project actually declares in `.openai/hosting.json`.
 *
 * `@cloudflare/workers-types` ships `Cloudflare.Env` as an empty interface for
 * projects to augment, which is what types the `env` export of
 * `cloudflare:workers` used by `lib/forecast/cache.ts` and `db/index.ts`.
 */
declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
  }
}

# San Diego Surf Dashboard

An interactive five-day surf forecast for 17 San Diego County breaks. The app combines public marine, buoy, tide, and wind data with break-specific exposure, period, tide, and confidence logic.

The public Sites deployment is currently available at [san-diego-surf-dashboard.pwysong.chatgpt.site](https://san-diego-surf-dashboard.pwysong.chatgpt.site).

## Local development

Requirements:

- Node.js 22.13 or newer
- npm

Install and start the app:

```bash
npm ci
npm run dev
```

Then open the local URL printed by Vite.

## Validation

```bash
npm run lint
npm run typecheck
npm test
```

`npm test` builds the production artifact and runs the forecast regression suite. `npm run test:unit` skips the build and runs only the source-level tests, which is faster while iterating.

The build helpers prefer GNU `timeout` and fall back to `gtimeout` or an unbounded run, so the full validation path works on macOS as well as the Linux image.

## Project map

- `app/` — dashboard, interactive map, data-sources page, and forecast assembly route
- `lib/forecast/model.ts` — break profiles, swell response, scoring, summaries, and confidence
- `lib/forecast/providers.ts` — bounded provider requests, validation helpers, and isolated concurrency
- `lib/forecast/cache.ts` — memory and D1 caching, stale retention, refresh leases, and outage coalescing
- `lib/forecast/dates.ts` — San Diego-local date boundaries for current and future forecast views
- `db/` — durable forecast-cache schema and access
- `tests/` — provider-failure and forecast-engine regression tests
- `docs/forecast-verification.md` — what can be verified, measured skill, and evaluation rules
- `docs/data-source-options.md` — free and paid data sources that could improve the forecast model
- `scripts/verify-forecast-skill.mjs` — scores archived forecasts against CDIP truth (`npm run verify:skill`)
- `scripts/benchmark-peer.mjs` — records and reports comparisons against other forecasters (`npm run benchmark:add`, `npm run benchmark:report`)
- `benchmarks/` — the peer comparison log
- `.openai/hosting.json` — current ChatGPT Sites deployment configuration
- `AGENTS.md` — working conventions for Codex and other coding agents

## Data sources

The dashboard uses CDIP nearshore and buoy data, Open-Meteo marine/weather forecasts, NOAA CO-OPS tides, and National Weather Service wind fallback. The in-app `/data-sources` page shows provider health, freshness, forecast coverage, and modeling limitations.

Forecast values are modeled estimates, not direct observations of breaking wave faces. Missing wave, tide, wind, or water values are shown as unavailable rather than filled with synthetic defaults. A stored forecast is labeled cached, retains the provider status from its generation time, and has its confidence reduced as it ages.

The five-day strip shows the largest coherent daytime face response and its larger-set range so surfers can see an incoming build even when the cleanest window occurs earlier. Breaks with a verified tendency for the mapped nearshore point to flatten incoming long-period energy can also use the independent regional planning guide. The selected value always comes from one source and one forecast hour; model components are never mixed. Selecting a future day opens the separate best-window estimate. Source confidence is not presented as measured accuracy, and forecast skill is not measured.

## Deployment

The existing ChatGPT Sites deployment can remain online while GitHub becomes the source of truth. Sites-specific configuration is intentionally retained so the project can still be deployed there. A future move to another host will require adapting the Cloudflare/Sites runtime bindings used for durable caching.

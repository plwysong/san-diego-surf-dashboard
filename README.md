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
npm test
```

`npm test` builds the production artifact and runs the forecast regression suite. The build helpers use Bash and GNU `timeout`; on macOS, run development directly or use a Linux environment for the complete production validation path.

## Project map

- `app/` — dashboard, data-sources page, and server routes
- `lib/` — forecast providers, break profiles, scoring, caching, and fallbacks
- `db/` — durable forecast-cache schema and access
- `tests/` — provider-failure and forecast-engine regression tests
- `.openai/hosting.json` — current ChatGPT Sites deployment configuration
- `AGENTS.md` — working conventions for Codex and other coding agents

## Data sources

The dashboard uses CDIP nearshore and buoy data, Open-Meteo marine/weather forecasts, NOAA CO-OPS tides, and National Weather Service wind fallback. The in-app `/data-sources` page shows provider health, freshness, and modeling limitations.

Forecast values are modeled estimates, not direct observations of breaking wave faces. Keep source provenance and confidence labels accurate when changing the forecast engine.

## Deployment

The existing ChatGPT Sites deployment can remain online while GitHub becomes the source of truth. Sites-specific configuration is intentionally retained so the project can still be deployed there. A future move to another host will require adapting the Cloudflare/Sites runtime bindings used for durable caching.

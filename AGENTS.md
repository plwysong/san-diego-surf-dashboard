# Agent instructions

## Goal

Maintain an accurate, resilient, and honest San Diego surf forecast. Never present fallback, cached, modeled, or incomplete data as live observation.

## Before changing code

- Read `docs/project-state.md` first. It says where the project stands, what is deliberately
  unfinished, and which decisions were made on evidence and should not be undone casually.
- Read `README.md` and inspect the relevant provider, forecast, UI, and test files.
- Preserve `.openai/hosting.json`, the existing package manager, lockfile, runtime bindings, and Sites compatibility unless the task explicitly changes hosting.
- Treat the public data-sources page as part of the forecast product. Update it whenever providers, fallbacks, caching, confidence, or forecast semantics change.

## Forecast invariants

- Keep swell height, direction, period, and timestamp from a coherent component/time rather than mixing daily extrema.
- Preserve multiple swell components and period-aware breaking response.
- Publish the set-wave band as the surf height and keep the typical band as a separate,
  smaller figure. Measured against Surfline across nine breaks, the set band matched to
  0.11 ft while the typical band ran 1.11 ft low. Leading with the typical band made a
  correct forecast read as an under-call.
- Never invent wind, tide, buoy, or wave values when a provider fails.
- Isolate provider and spot failures; one failure must not erase healthy regions or breaks.
- Label retained real data as cached/stale, never as current live data.
- Confidence must reflect freshness, forecast horizon, source availability, and agreement.
- Confidence is not accuracy. Do not present source confidence as forecast skill, or vice versa.
- CDIP MOP nowcast and hindcast are the permitted verification reference because they are
  buoy-initialised, but they remain model output. Never label them an observation.
- Comparing against other forecasters is allowed and useful, and is the only available check
  on the breaking-face translation. They are never ground truth and are never scored as such,
  but do not read the rule above as a ban on comparison. It has been misread that way before.
- See `docs/forecast-verification.md` before changing anything about verification.

## Deploying

- Deployment is not possible from this repository. The site runs on ChatGPT Sites; `vinext deploy`
  targets Cloudflare Workers, a different platform, and wrangler is not authenticated. The owner
  deploys by asking ChatGPT to deploy the repo. Do not attempt it, and do not deploy to a
  temporary preview account to work around it.
- `main` is routinely ahead of production. Check before assuming a fix is live.
- The first request after a deploy must report `cache.state: "origin"`. The cache key carries a
  build id so every deploy invalidates its predecessor; a cache hit means the deploy did not take.

## Things that pass locally and fail in production

Every production bug found so far had this shape. Local Node is more permissive than a Worker.

- Outbound requests must send a `User-Agent`. `api.weather.gov` returns 403 without one, Node
  supplies a default and Workers do not, and this silently disabled the NWS wind fallback in
  production while every test passed.
- Open-Meteo's free tier rate-limits by IP and Cloudflare's egress is shared, so 429s occur that
  have nothing to do with this app's request volume. Fallbacks must actually work.
- If a test depends on the time of day, run it under a shifted clock across the day. One did, and
  it blocked a deploy.

## Validation

Run the narrowest relevant test while iterating, then before handoff run:

```bash
npm run lint
npm run typecheck
npm test
```

For UI changes, also verify desktop and mobile behavior, keyboard access, future-day selection, break-pill selection, contained list scrolling, and `/data-sources` navigation.

## Git workflow

- Keep `main` releasable.
- Use a focused branch such as `agent/<short-description>` for changes.
- Keep commits narrow and describe user-visible behavior.
- Do not commit secrets, local runtime state, generated build output, or provider credentials.

# Project state

Start here if you are taking over. `README.md` says what the app is; `AGENTS.md` lists the rules you must not break. This file says where things stand, what is deliberately unfinished, and what will bite you.

Accurate as of commit `c91927d`, 2026-08-26.

## Does it work

Yes. Seventeen breaks, five days, live at [san-diego-surf-dashboard.pwysong.chatgpt.site](https://san-diego-surf-dashboard.pwysong.chatgpt.site). Nothing displayed is fabricated: a missing value renders as unavailable and cached data is labelled as cached.

`npm run lint`, `npm run typecheck` and `npm test` (29 tests) all pass on `main`.

## What is actually known about accuracy

This matters more than any other section, because it is easy to overstate.

**The wave inputs are measured accurate.** Scored against CDIP's buoy-initialised nowcast: 0.25 ft mean absolute error at day one, rising to about 0.6 ft at day five in large surf. Error scales with sea state, and the sharp step is between day one and day two, not gradually across the week. Full numbers and method in [forecast-verification.md](./forecast-verification.md).

**The published surf height agrees with Surfline.** Across all seventeen breaks in one pass: mean difference −0.09 ft, eleven of seventeen within half a band. Independently, both conversions sit at about 1.2× nearshore Hs. Samples in `benchmarks/peer-samples.json`.

**Nothing verifies the breaking-face translation directly.** No instrument measures a breaking wave. `spotHeight()`'s per-break constants are checked only by peer comparison, which is why that comparison matters and why the benchmark exists.

**Forecast skill is not measured and the UI says so.** That is accurate; do not change the wording without evidence behind it.

## Deployment

**Deploying is not something you can do from this repository.** The site runs on ChatGPT Sites. `vinext deploy` targets Cloudflare Workers, which is a different platform, and wrangler is not authenticated. There is no Sites CLI or credential locally. Deploys are performed by asking ChatGPT to deploy the repo, and the owner does that.

Consequences worth internalising:

- **`main` is routinely ahead of what is live.** Check before assuming a fix is in production.
- **The first request after a deploy must report `cache.state: "origin"`.** The cache key carries a build id, so every deploy invalidates its predecessor. A cache hit means the deploy did not take.
- **A deploy changes what people see.** Verify locally first, including in a browser, not only through tests.

## What will bite you

Every production bug found so far shared one shape: **it worked locally and failed once deployed.** Local Node is more permissive than a Cloudflare Worker, and the test suite cannot see the difference.

- `api.weather.gov` returns 403 without a `User-Agent`. Node supplies one by default and Workers do not, so the NWS wind fallback silently 403'd in production while every test passed. All outbound requests now send one, and a test enforces it.
- Open-Meteo's free tier rate-limits **by IP**, and Cloudflare's egress is shared with enormous unrelated traffic. Expect 429s that have nothing to do with your request volume. This is the single largest source of live degradation and it is not fixable by making fewer requests.
- A cached payload outlives a deploy. Fixed by the build id, but the same class of problem will recur wherever state survives a release.
- One test depended on the hour of day and blocked a deploy. If a test involves time, run it under a shifted clock across the day before trusting it.

## Deliberately not done

Do not "fix" these without evidence. Each was a decision, not an oversight.

- **Gusts, spectral width (`waveTa`) and radiation stress (`waveSxx`/`waveSxy`) are archived but not scored.** Their direction of effect is obvious; the magnitude needs a constant that cannot yet be validated. Adding one would shift every rating with nothing to check it against. They are described in the summary text instead, where thresholds already existed and were measured before being chosen.
- **Windansea is not tuned.** It read a band below Surfline's observed value, but Surfline's own model agreed with ours; a forecaster had overridden it. Model versus human is not a calibration signal. Changing the constant would have chased a single observation.
- **No individual break constant has been changed.** Across seventeen breaks the misses go in both directions, which is scatter rather than bias. What would justify a change is the same break missing the same way across several readings on different swells. That is what the benchmark log accumulates.
- **`vinext` has not been upgraded** past `0.0.50`. Moving to `1.0.0-beta.8` would close three advisories but is a major jump to a beta, and belongs with a hosting decision rather than before one.

## Open, roughly in order

1. **Deploy `c91927d`.** It carries the User-Agent fix, so wind survives an Open-Meteo outage instead of vanishing at all seventeen breaks. Live is currently showing wind unavailable for exactly that reason.
2. **Sunrise and sunset should not come from a weather API.** They are pure astronomy, computable from latitude, longitude and date. Sourcing them from the rate-limited Open-Meteo response is why the daylight window degrades to an assumed 5am–7pm during outages.
3. **Score the nearshore path.** `forecast_history` has been archiving runs since 2026-08-25 and CDIP truth is already available, so this needs no new data collection. It is the like-for-like comparison, same model and point, differing only in forecast versus buoy-initialised winds.
4. **Six high-severity advisories remain.** Three are vinext-family and only close by moving off it; two are eslint, development only.
5. **Hosting.** The site is on ChatGPT Sites with a `0.0.x` framework in the runtime path. Moving to the owner's own Cloudflare account keeps D1 and `cache.ts` intact and is the least-work option. Vercel was considered and would require replacing the durable cache.

## Tools you will want

```bash
npm run verify:skill                 # score archived forecasts against CDIP truth
npm run verify:skill -- --from 2026-02-01 --to 2026-02-24   # a specific window
npm run benchmark:add -- --spot "Blacks" --their 3-4        # record a peer reading
npm run benchmark:report             # ours vs peer vs truth
```

`benchmark:add` needs a running forecast, so `npm run dev` in another terminal.

## A closing note on method

The largest defect found in this codebase was not a crash. The app published the wrong height band as its headline, ran a foot below every other forecaster, and was internally consistent and physically correct the whole time. No amount of verification against ground truth could have surfaced it, because the physics was right and the convention was wrong.

Verify against truth where truth exists. Compare against peers where it does not. The second is not a weaker substitute for the first; it catches a class of error the first cannot reach.

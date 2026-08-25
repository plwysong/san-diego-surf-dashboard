# Forecast verification

## Confidence and skill are different things

Source confidence answers whether the public feeds are fresh, complete, and mutually coherent. It is a statement about inputs, and the dashboard computes it.

Forecast skill answers how closely past forecasts matched what actually happened. It is a statement about outcomes, and the dashboard does **not** compute it. A forecast can have excellent confidence and poor skill: every feed fresh, every source agreeing, and the result still wrong. The two must never be presented as one number.

`lib/forecast/verification.ts` implements the scoring — exact height-band agreement, within-one-foot agreement, midpoint mean absolute error, underforecast rate, and circular wind error. Nothing currently supplies it with samples, so the UI states that skill is not measured.

## What can actually be verified

Verification needs pairs: what was predicted for a time, and what happened at that time. The two halves have very different availability.

### Truth is already available, and goes back years

CDIP publishes four datasets per MOP point, not one. Confirmed against `thredds.cdip.ucsd.edu` on 2026-08-25 for `D0537`:

| dataset | direction | coverage | notes |
| --- | --- | --- | --- |
| `_forecast.nc` | forward only | now → ~6 days, 3-hourly | what the dashboard consumes; past runs are **not** retained |
| `_ecmwf_fc.nc` | forward | — | an independent second model, usable for agreement |
| `_nowcast.nc` | backward | ~365 days, hourly | buoy-initialised |
| `_hindcast.nc` | backward | ~2010 → early 2025, hourly | buoy-initialised archive |

The nowcast and hindcast hand off to each other, giving a continuous hourly record at the same model point the forecast targets.

These are not merely another forecast. CDIP initialises the nowcast and hindcast with buoy measurements propagated through a 100 m spectral refraction model, explicitly in contrast to models initialised from modelled wind fields. That makes them the best available reconstruction of what the ocean did at a MOP point.

### Past predictions are the missing half

- **CDIP MOP:** past forecast runs are not archived. Only the live run is served. Retroactive verification of the nearshore path is therefore impossible; runs must be stored as they are issued.
- **Open-Meteo:** past runs *are* archived, and for marine variables they are exposed on the ordinary marine endpoint rather than a separate host. Requesting `wave_height_previous_day1` through `_day7` returns the forecast issued that many days before each valid hour. Confirmed populated at all seven lead times, selectable either by `past_days` (at least 120) or by explicit `start_date`/`end_date`, which reaches back to at least January 2026. The regional path can therefore be verified retroactively with no waiting.
- **This repository:** `forecast_history` now records one row per built run, keyed by issue time and pruned after 90 days. Before that table existed, `lib/forecast/cache.ts` kept a single row under one constant key and overwrote it, so no run issued before 2026-08-25 can be recovered.

### What cannot be verified by instrument at all

The dashboard's headline output is a breaking-wave face range at a named break. No instrument measures that. CDIP measures significant wave height at a model point in roughly 10 m of water, which is a different quantity. `spotHeight()` bridges the two using per-break shoal, exposure, and period-response constants.

So the verifiable chain stops one step short of the published number. Swell height, period, direction, wind, and tide can all be scored automatically. The final translation into faces cannot, and remains a calibration judgement.

## Truth labelling

Do not treat another provider's *forecast* as an observation. Surfline's LOTUS output and non-observed spot cards remain external model comparisons.

The MOP nowcast and hindcast are a permitted verification reference, because they are driven by buoy measurements rather than modelled winds. They are still model output. Any published result must say it was verified against a buoy-initialised reconstruction, never against an observation. Source confidence must never be presented as accuracy.

## Measured skill, regional wave input

Measured 2026-08-25 with `npm run verify:skill`, comparing Open-Meteo's `*_previous_dayN` marine forecasts against the CDIP MOP nowcast at each break. Bias-corrected mean absolute error, in feet:

| window | median Hs | analysis | day 1 | day 2 | day 3 | day 4 | day 5 | growth |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-08-18 → 08-25 | 0.9 ft | 0.14 | 0.12 | 0.13 | 0.14 | 0.19 | 0.23 | +0.09 |
| 2026-01-08 → 01-28 | 2.1 ft | 0.25 | 0.23 | 0.27 | 0.27 | 0.27 | — | +0.02 |
| 2026-02-01 → 02-24 | 3.2 ft | 0.42 | 0.45 | 0.58 | 0.60 | 0.61 | 0.66 | +0.24 |
| 2026-02-15 → 02-22 | 3.5 ft, max 8.7 | 0.30 | 0.38 | 0.62 | 0.63 | 0.72 | 0.82 | +0.52 |

The last row is the largest swell event in the available nowcast archive, peaking at 8.9 ft nearshore Hs on 18 February.

Three findings:

**Error scales with sea state, and so does its growth.** A calm window suggests the forecast barely degrades across five days. That does not survive contact with real swell. On the February event, day-five error is nearly triple the analysis error, and the share of forecasts within one foot falls from 96 per cent to 71 per cent. Any skill figure quoted without its sea state is misleading.

**The degradation is a step between day one and day two, not a gradual slope.** During the peak event, error moves 0.38 → 0.62 ft across that single step and then flattens. Day one stays reliable in big surf at 91 per cent within a foot.

**La Jolla Shores is a consistent outlier**, roughly double any other break at every lead time (0.86 → 1.41 ft during the event). It is the most sheltered spot in the set, and a linear bias correction does not capture that sheltering. The regional fallback should be treated as least trustworthy there.

This also supplies evidence for a choice the code already made. `forecastConfidence()` decays with `horizonHours` and caps confidence at 55 beyond 72 hours, so day three and later can never read better than Low. Measured error roughly doubles by day three in big surf, which makes that cap directionally correct rather than merely cautious.

### What this does not measure

The scores above cover the **regional Open-Meteo path**, which the dashboard uses as a fallback. Its primary nearshore path is CDIP MOP, whose past runs are not archived anywhere, so it can only be scored once `forecast_history` has accumulated runs.

Nothing here touches the breaking-face translation. `spotHeight()` converts significant wave height into a face range using per-break shoal, exposure, and period response, and no instrument measures the result. The published number therefore remains unverified, which is why the UI still states that forecast skill is not measured.

## Order of work

1. ~~Store each forecast run.~~ Done: `forecast_history` records one row per built run.
2. ~~Backfill the regional path as a one-off analysis.~~ Done: `scripts/verify-forecast-skill.mjs`, results above.
3. **Score the nearshore path** once enough runs have accumulated, comparing stored MOP forecasts against the MOP nowcast for the same hours. This is the like-for-like comparison — same model, same point, differing only in forecast versus buoy-initialised winds — and needs no bias correction.
4. **Decide what to surface**, if anything. Any published figure must be split by lead time and reported with the sea state it was measured over.

Calibration of the face-height step stays a separate, lighter question. The input chain is now shown to be sound, so the remaining uncertainty sits in a handful of constants, and occasional informal comparison is informative. It does not require a sampling programme, and one should not be specified.

Options for closing the remaining gaps, including what could be bought and what could not, are recorded in [data-source-options.md](./data-source-options.md).

## Forecast semantics

Daily planning ranges use one coherent forecast hour and source. Breaks explicitly calibrated for a regional upside check may select the larger daytime response from either the break-adjacent forecast or the independent regional planning guide. Their wave components are evaluated separately and never combined. Other breaks remain nearshore-only. Best-window details stay tied to the representative hour inside the highest-quality daylight window. These two values must not be mixed.

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
- **Open-Meteo:** past runs *are* archived. The Previous Runs API exposes fixed lead-time offsets of 1–7 days from January 2024, and the Historical Forecast API covers roughly 2022 onward. The regional path can be verified retroactively with no waiting.
- **This repository:** `lib/forecast/cache.ts` writes a single row under one constant key and overwrites it on every refresh. No forecast history exists.

### What cannot be verified by instrument at all

The dashboard's headline output is a breaking-wave face range at a named break. No instrument measures that. CDIP measures significant wave height at a model point in roughly 10 m of water, which is a different quantity. `spotHeight()` bridges the two using per-break shoal, exposure, and period-response constants.

So the verifiable chain stops one step short of the published number. Swell height, period, direction, wind, and tide can all be scored automatically. The final translation into faces cannot, and remains a calibration judgement.

## Truth labelling

Do not treat another provider's *forecast* as an observation. Surfline's LOTUS output and non-observed spot cards remain external model comparisons.

The MOP nowcast and hindcast are a permitted verification reference, because they are driven by buoy measurements rather than modelled winds. They are still model output. Any published result must say it was verified against a buoy-initialised reconstruction, never against an observation. Source confidence must never be presented as accuracy.

## Order of work

1. **Store each forecast run.** This is the only time-sensitive item: CDIP keeps no forecast archive, so unstored runs are lost permanently, while truth remains available back to 2010.
2. **Backfill the regional path as a one-off analysis**, not a product feature. Past Open-Meteo runs at 1–5 day lead times, scored against CDIP truth through the existing `verification.ts`. This establishes whether the forecast chain is any good before any of it is productionised.
3. **Decide on the product** using that result. Only then consider surfacing skill in the UI, and only split by break and lead time.

Calibration of the face-height step is a separate, lighter question. Once the input chain is shown to be sound, the remaining uncertainty is a handful of constants, and occasional informal comparison is informative. It does not require a sampling programme, and one should not be specified.

## Forecast semantics

Daily planning ranges use one coherent forecast hour and source. Breaks explicitly calibrated for a regional upside check may select the larger daytime response from either the break-adjacent forecast or the independent regional planning guide. Their wave components are evaluated separately and never combined. Other breaks remain nearshore-only. Best-window details stay tied to the representative hour inside the highest-quality daylight window. These two values must not be mixed.

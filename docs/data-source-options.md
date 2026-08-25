# Paid and non-free data options

A record of what could be bought if this becomes something more robust, and what it would actually fix. Nothing here is committed to, and none of it is currently used.

## The principle

Measurement changes what is worth buying. `docs/forecast-verification.md` records that the regional wave input is already accurate at day one even in large surf, so paying for a better wave model has low marginal value. The weak links are elsewhere, and the options below are ordered by which measured gap they close rather than by vendor.

Free options are listed first in each section on purpose. Two of the highest-value improvements available cost nothing.

## Gap 1 — No ground truth at the break

The published number is a breaking-wave face range. No instrument measures that, so `spotHeight()`'s shoal, exposure, and period-response constants are unfalsifiable.

| option | cost | what it actually fixes |
| --- | --- | --- |
| Informal comparison by eye | free | The realistic answer. A dozen casual checks a season would expose a systematic calibration error. |
| Camera plus computer vision | own hardware, or licensing | The only thing that measures breaking waves. Surfline's Camera Insights is this. Also a product feature, not just verification. |
| Moored nearshore buoy, e.g. Sofar Spotter | hardware plus subscription, no public pricing | Real directional wave measurement at the break. |
| Crowdsourced "did it match" reports | free to build | Cheap and noisy. Feedback, never verification. |

**The buoy does not solve this gap.** A Spotter measures significant wave height and direction, which is the same quantity CDIP already models well. It would sharpen nearshore verification, not face verification. Only an optical method measures the face. This distinction is easy to get wrong when a buoy looks like the obvious purchase.

## Gap 2 — Confidence is heuristic, not probabilistic

`forecastConfidence()` scores freshness, coverage, horizon, and agreement. It is a reasoned heuristic, and the UI correctly refuses to present it as accuracy. A real uncertainty figure would be better, and it is available for nothing.

Open-Meteo's marine endpoint exposes four independent wave models, confirmed working on 2026-08-25:

| identifier | model |
| --- | --- |
| `ecmwf_wam` | ECMWF WAM, 9 km |
| `ecmwf_wam025` | ECMWF WAM, 25 km |
| `gwam` | DWD global |
| `meteofrance_wave` | MeteoFrance MFWAM |

Their disagreement grows monotonically with lead time at Blacks: 0.81 ft at day one, 1.10 ft at day five, 1.34 ft at day seven. That is a genuine uncertainty signal from four independent physics runs, and it costs nothing.

Inter-model spread overstates error at short leads — day-one spread of 0.81 ft against a measured day-one error of 0.38 ft during the February event — so it needs calibrating against the measured errors before being shown. That calibration is now possible, because those errors have been measured.

**This is the best value available and requires no spend.** Paid alternatives (ECMWF ensemble tiers, commercial ensemble APIs) should only be considered after free multi-model spread has been tried and found wanting.

## Gap 3 — Wind is the least verified input

Wind frequently decides surf quality more than swell size, and none of it has been scored. NOAA CO-OPS publishes observed wind at La Jolla, which the dashboard already fetches for its live correction and which has a historical archive. Verifying the wind forecast against it is free and unstarted.

Do that before paying for higher-resolution wind. If free verification shows the wind forecast is the limiting factor, commercial options become worth pricing:

- **Stormglass.io** — marine and wind aggregation across models via one integration. Free to sign up, usage-based billing; a third-party listing quotes roughly €16/month to €172/year, which should be confirmed directly rather than trusted here.
- **Meteomatics, StormGeo, Fugro** — commercial weather and marine APIs aimed at operational users. Not investigated.

## Gap 4 — The nearshore model itself

CDIP MOP is purpose-built for the California coast, buoy-initialised, published at 100 m resolution, and free. It is unlikely that a commercial coastal model would beat it here specifically. This gap probably cannot be bought out of.

## Surfline

Licensing terms were not investigated. The existing rule stands regardless: its LOTUS output and non-observed spot cards are an external model comparison, never an observation. Its camera network is the genuine moat, and the strategy notes already treat permissioned links or partnerships as the realistic route rather than reproduction.

## What is unverified here

Sofar publishes no public pricing; the figure quoted for Stormglass comes from a third-party aggregator rather than the vendor. Meteomatics, StormGeo, and Fugro were not priced. Anything acted on should be confirmed with the vendor.

## Suggested order

1. Calibrate multi-model spread into the confidence score. Free, already available, closes the largest honest gap.
2. Verify wind against NOAA CO-OPS observations. Free, and decides whether wind data is worth paying for.
3. Score the nearshore path once `forecast_history` has accumulated runs. Free.
4. Only then consider a camera, which is the sole option that addresses the face translation, and is a product feature as much as a measurement one.

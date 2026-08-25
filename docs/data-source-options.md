# Data sources that could improve the model

Options for making the forecast itself better, free and paid. Nothing here is in use. Ordered by expected impact on model fidelity rather than by vendor.

The short version: **the dashboard consumes 3 of the 18 variables CDIP already returns at the points it queries**, and the largest available improvements cost nothing because they are already inside responses being parsed and discarded.

Sample values below were measured at `D0537` (Blacks) on 2026-08-25.

## Tier 1 — already in the CDIP requests being made

`fetchMopForecast()` requests `waveHs`, `waveTp`, `waveDp`, plus `waveEnergyDensity` and `waveMeanDirection` for the seven spots in `prioritySpectralSpots`. Every MOP point also publishes the following, at no extra request cost.

### Directional Fourier coefficients — `waveA1Value`, `waveB1Value`, `waveA2Value`, `waveB2Value`

Directional *spread* per frequency, rather than one mean direction per band.

`componentFaceFeet()` currently computes exposure from `cos(angularDifference(component.direction, profile.swellTarget))`. That treats every component as a single ray. A narrow long-period groundswell and a broad short-period windswell with identical height, period and peak direction receive identical exposure, and they do not break alike.

This is the most likely explanation for the largest error in the measured results. La Jolla Shores runs roughly double every other break at every lead time, and it is the most sheltered spot in the set. Sheltering and refractive focusing are governed by directional spread, which the model cannot currently represent.

### Spectral width — `waveTa` alongside `waveTp`

Measured: `waveTp` 16.67 s, `waveTa` 8.46 s. A ratio near 2 means a long-period swell sitting under substantial short-period energy.

The face calculation applies the peak component's period response across the estimate. Tp/Ta is a free, single-number spectral-width indicator that distinguishes a clean groundswell from a mixed sea of the same nominal period.

### Radiation stress — `waveSxx`, `waveSxy`

Measured: 0.0111 and 0.00118. These are the momentum-flux terms that physically drive wave setup, longshore current and breaking intensity — the processes `profile.shoal` stands in for as a single tuned scalar.

### Input coverage and provenance — `waveModelBinInputCoverage`, `waveModelInputSource`

`waveModelBinInputCoverage` returns one value per frequency bin, 28 in the sample, ranging 0.9962 to 1.0. It is CDIP stating how well each frequency band is constrained by real buoy input. `waveModelInputSource` names the buoys feeding each bin.

This is a better confidence input than anything `forecastConfidence()` currently derives, because it comes from the model itself and degrades bin by bin during a buoy outage rather than being inferred from freshness.

### Full spectral partitions at every break

`prioritySpectralSpots` limits energy-density and mean-direction requests to seven spots. That is a request budget, not a data limitation.

## Tier 2 — free, new sources, verified working

| source | measured | what it would fix |
| --- | --- | --- |
| **NOAA CO-OPS observed water level** (`product=water_level`) | Observed 1.897 ft where the prediction said 1.377 ft, a 0.52 ft residual | The model uses tide *predictions* only. Half a foot is enough to move a break in or out of its `tideLow`/`tideHigh` window, and non-tidal residual grows with storm surge. Recent residual can be measured and persisted forward as a correction. |
| **Wind gusts** (`wind_gusts_10m`) | 24/24 hours populated | Gust-to-mean ratio is surface texture, which is most of what separates clean from bumpy. `scoreConditions()` sees mean wind only. |
| **Ocean currents** (MeteoFrance SMOC, on the marine endpoint) | velocity and direction, 24/24 hours | Wave–current interaction steepens and refracts swell. Not modelled at all. |
| **Multi-model mean** (`ecmwf_wam`, `ecmwf_wam025`, `gwam`, `meteofrance_wave`) | all four respond | A multi-model mean usually beats any single member. This is an accuracy gain, separate from using their spread as an uncertainty estimate. |
| **Sea surface temperature** (marine endpoint) | 24/24 hours | Currently taken from whichever buoy happens to be nearest. A gridded field is more consistent. |

## Tier 3 — promising, access not verified

- **NOAA NWPS.** SWAN at 500 m to 1.8 km nearshore, publishing spectra and individually tracked wave systems, driven by forecaster-refined wind grids rather than raw model wind. Would be a genuine independent second nearshore model. Programmatic access for the San Diego office was not confirmed; the NOMADS path responded but no San Diego product could be located. Investigate before relying on it.
- **Bathymetry.** NOAA CUDEM coastal elevation models, and a published multi-year Scripps dataset of San Diego beach bathymetry and waves. Would allow `profile.shoal` to be derived rather than tuned, and would let seasonal sandbar movement be represented at beach breaks. Neither was tested here.
- **Kelp canopy.** Southern California kelp measurably damps swell, and Landsat-derived canopy products exist. Very local to this coast and modelled by nobody. Availability and cadence not checked.

## Tier 4 — paid

Ranked by whether they add physics or convenience.

- **High-resolution wind** (Meteomatics, StormGeo, Fugro). The most defensible purchase, because wind is the least verified input and frequently decides surf quality. Verify the free wind against CO-OPS observations first; that determines whether this is worth pricing at all. None were priced here.
- **Stormglass.io.** Aggregates several models behind one integration. Convenience rather than new physics, and Open-Meteo already exposes four wave models free. Free to sign up with usage-based billing; a third-party listing quotes roughly €16/month to €172/year, which should be confirmed with the vendor.
- **Sofar Spotter buoy.** A moored nearshore buoy would give a real local measurement to assimilate. No public pricing. Note that it measures significant wave height, the quantity CDIP already models well, so it improves initialisation rather than the breaking-face step.
- **Commercial coastal modelling** (DHI, Deltares). Unlikely to beat CDIP MOP for California, which is purpose-built for this coast, buoy-initialised and free.

## Suggested order

1. Consume the CDIP variables already being returned, starting with the directional coefficients. No new dependency, no new request, and it addresses the largest measured error in the current results.
2. Add observed water level and wind gusts. Small, free, and both feed terms the scoring function already has.
3. Take the multi-model mean, and use the spread as a calibrated uncertainty rather than the present heuristic.
4. Investigate NWPS and bathymetry, which are the two that could change the model's structure rather than its inputs.
5. Only then price commercial wind, and only if free verification shows wind to be the limiting factor.

Verification methodology and measured skill are recorded in [forecast-verification.md](./forecast-verification.md).

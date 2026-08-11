# Forecast verification

The dashboard distinguishes source confidence from forecast skill. Source confidence answers whether the public feeds are fresh, complete, and mutually coherent. Forecast skill answers how closely an issued forecast matched a later verified breaking-wave observation.

Forecast skill stays **not yet measured** until enough timestamped, spot-specific verification samples exist. A useful sample must preserve:

- the forecast issue and valid times;
- the break and forecast horizon;
- the predicted typical face range;
- a later verified observed range and its source;
- wind speed and direction when they were actually observed.

Do not treat another provider's modeled value as an observation. Surfline can be used for periodic product benchmarking, but its LOTUS forecasts and non-observed spot cards must remain labeled as external model comparisons. Automated ingestion requires an authorized data agreement.

`lib/forecast/verification.ts` calculates exact height-band agreement, within-one-foot agreement, midpoint mean absolute error, underforecast rate, and wind errors. Results should be reviewed by break and forecast horizon before changing calibration. A minimum sample count should be chosen before publishing a skill score; until then the public UI remains explicit that skill is not measured.

Daily planning ranges use one coherent forecast hour and source. Breaks explicitly calibrated for a regional upside check may select the larger daytime response from either the break-adjacent forecast or the independent regional planning guide. Their wave components are evaluated separately and never combined. Other breaks remain nearshore-only until verification supports the alternate guide. Best-window details stay tied to the representative hour inside the highest-quality daylight window. These two values must not be mixed.

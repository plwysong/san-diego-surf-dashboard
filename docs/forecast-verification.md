# Forecast verification

The dashboard distinguishes source confidence from forecast skill. Source confidence answers whether the public feeds are fresh, complete, and mutually coherent. Forecast skill answers how closely an issued forecast matched what later actually occurred.

Forecast skill is **not measured**. `lib/forecast/verification.ts` implements the scoring — exact height-band agreement, within-one-foot agreement, midpoint mean absolute error, underforecast rate, and circular wind error — but no sample source is wired to it. The public UI therefore states that skill is not measured rather than implying an accuracy figure exists.

Do not treat another provider's modeled value as an observation. Surfline can be used for periodic product benchmarking, but its LOTUS forecasts and non-observed spot cards must remain labeled as external model comparisons.

Source confidence must never be presented as accuracy. It reflects freshness, coverage, forecast horizon, and agreement between sources, and nothing more.

Daily planning ranges use one coherent forecast hour and source. Breaks explicitly calibrated for a regional upside check may select the larger daytime response from either the break-adjacent forecast or the independent regional planning guide. Their wave components are evaluated separately and never combined. Other breaks remain nearshore-only. Best-window details stay tied to the representative hour inside the highest-quality daylight window. These two values must not be mixed.

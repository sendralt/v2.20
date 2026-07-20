# Scientific Verdict: Science Engine Overhaul Specification

**Independent Review Date:** 2026-06-23  
**Reviewer Domain Expertise:** Fisheries Biology, Aquatic Ecology, Environmental Physiology  
**Documents Reviewed:** Specification (`science-engine-overhaul.md`), Science Review Report (`science-review-report.md`), Engine Source Code (6 modules), Species Data (`fishingData.json`)  
**Classification:** Independent Scientific Audit

---

## 1. Overall Verdict

### Rating: PARTIALLY SOUND

The specification proposes a pragmatic and directionally correct set of improvements to a heuristic-based fishing forecast engine. It correctly identifies the most important missing biological variables (dissolved oxygen, spawning cycles, thermocline depth) and proposes reasonable architectural fixes (removing the 4th-root dampening, wiring the sensitivity field, adding confidence bands). The engineering discipline is commendable — preserving existing architecture, requiring tests for all new logic, and demanding citations for magic numbers.

However, the specification contains several scientifically questionable modeling decisions, inherits the existing engine's fundamental limitation of being an **uncalibrated heuristic** (explicitly acknowledged in Assumption 4), and in two critical areas — the dissolved oxygen model and the thermocline model — proposes approaches that **overstate their scientific rigor** while relying on proxy data that cannot achieve the claimed precision. The spec also does not address the most fundamental scientific concern: the **entire scoring architecture is a multiplicative chain of uncalibrated multipliers with no validation against empirical catch data**.

The specification is a solid engineering plan that would improve the product's honesty and structural completeness, but it should not be presented as making the engine "scientifically rigorous." It makes the engine **more scientifically informed** and **more transparent about its limitations**, which is valuable and defensible, but the resulting model remains a heuristic.

---

## 2. Claim-by-Claim Analysis

### 2.1 Metabolic Efficiency Model (Existing — Spec Preserves and Patches)

**Claim:** The smoothstep + cubic decay curve models fish metabolic efficiency as a function of water temperature, producing a "left-skewed thermal performance curve consistent with ichthyological research on Q10 temperature coefficients and aerobic scope."

**Validity: PARTIALLY VALID**

**Reasoning:**

The conceptual basis is sound. Fish thermal performance curves (TPCs) are well-established in physiological ecology and do produce asymmetric curves — rising gradually through a suboptimal to optimal range, then declining steeply past the optimum toward critical thermal maximum (CTMax). This was established by Brett (1971, *American Zoologist* 11:99-113), Fry (1947, *University of Toronto Biological Series* 55), and synthesized comprehensively by Angilletta (2009, *Thermal Adaptation: A Theoretical and Empirical Synthesis*, Oxford University Press).

The specific mathematical shapes chosen, however, are **not derived from fish physiology** — they are convenience functions:

- **Smoothstep** (x²(3-2x)) is a computer graphics interpolation function, not a biological model. The actual temperature-metabolism relationship in the rising phase follows an exponential (Arrhenius-type) or sigmoidal curve governed by enzyme kinetics, not a smoothstep polynomial.
- **Cubic decay** ((1-x)³) for the crash phase has no physiological derivation. The real post-optimal decline in aerobic scope follows a concave curve that often approximates a linear or gently quadratic decline (Norin et al. 2014, *Journal of Experimental Biology* 217:2440-2448). A cubic decay is arguably **too steep** — it implies near-total collapse immediately above optimal temperature, whereas most fish retain significant aerobic scope for 3-5°C above their optimum.

The Q10 reference is **misleading**. Q10 is the factor by which a reaction rate increases for a 10°C temperature rise. For fish metabolic rates, Q10 typically ranges from 2.0-3.0 in the sub-optimal range (Fry 1971; Clarke & Johnston 1999, *Journal of Animal Ecology* 68:892-905). The smoothstep model does not implement or reference Q10 in any computable way — no Q10 coefficient is calculated, and the curve shape would produce variable apparent Q10 values that change with temperature.

The claim about "aerobic scope" is conceptually appropriate — aerobic scope (the difference between standard and maximum metabolic rate) does peak at an intermediate temperature (Pörtner & Knust 2007, *Science* 315:95-97; Pörtner & Farrell 2008, *Science* 322:690-692). But the model does not actually compute aerobic scope. It computes a normalized curve with no units, no species-specific parameters for standard or maximal metabolic rate, and no relationship to the actual aerobic scope concept beyond sharing the same asymmetric shape.

**The T_max formula (T_opt + 0.5 × range) is scientifically unjustifiable.** This means: for Largemouth Bass (opt=72, dorm=45, range=27), T_max = 72 + 13.5 = 85.5°F. The actual Critical Thermal Maximum (CTMax) for Largemouth Bass is approximately 37-38°C (98.6-100.4°F) per Beitinger et al. (2000, *Transactions of the American Fisheries Society* 129:100-111). The formula underestimates the lethal boundary by **~15°F**, which means the model incorrectly predicts metabolic collapse at temperatures where bass are actually still metabolically active. The spec correctly identifies this as a flaw and proposes species-specific Upper Incipient Lethal Temperature (UILT) values — this is the right fix.

**Verdict:** The architecture is reasonable as a heuristic. The specific curve shapes and constants are not derived from physiology. The T_max formula is the most serious quantitative error. The references to Q10 and aerobic scope in the JSDoc overstate the scientific basis.

---

### 2.2 4th-Root Dampening Removal (Spec Proposal)

**Claim:** The 4th-root dampening (`x^0.25`) compresses all environmental multipliers into a ±15% band, which severely understates real-world impact. Removing it (or replacing with square root or linear) gives environmental factors meaningful influence.

**Validity: VALID**

**Reasoning:**

The existing analysis is arithmetically correct. With four multipliers each ranging from ~0.75 to ~1.20, the product ranges from ~0.31 to ~2.07. The 4th root compresses this to ~0.75 to ~1.20 — a total environmental adjustment band of roughly ±20% (the review report says ±15% for all-max/all-min; the exact numbers depend on multiplier values, but the order of magnitude is right).

From a behavioral ecology perspective, environmental conditions (wind, cloud cover, time of day, water clarity) can easily produce 2-3x differences in catch rates (e.g., dawn vs. midday feeding in visual predators — Helfman 1986, *Environmental Biology of Fishes* 16:1-36). A ±20% environmental adjustment is insufficient to capture this variability.

However, there is a subtlety the spec does not address: **the 4th root was likely an intentional dampener to prevent extreme multiplier stacking from producing absurd scores.** Simply removing it and replacing with linear multiplication creates the opposite problem — all-max multipliers would produce a 2.07x boost on top of a metabolic+pressure base that could already be >0.8, producing bite probabilities >150% before clamping. The spec's success criteria say to recalibrate BITE_DIVISOR after the fix, which is the correct approach, but the specific plan for recalibration ("if median shifts significantly") is vague and lacks a calibration target.

**Verdict:** The analysis is sound. The removal is justified. But the replacement needs more than "recalibrate BITE_DIVISOR if scores shift" — it needs an explicit target distribution for bite probabilities and a documented calibration method.

---

### 2.3 Barometric Pressure Effects on Fish Behavior

**Claim:** Falling barometric pressure triggers increased feeding activity in fish (especially physostomous species), and rising pressure suppresses feeding. The engine models this with trend multipliers from 0.70 (rapidly rising) to 1.25 (rapidly falling).

**Validity: PARTIALLY VALID**

**Reasoning:**

This is one of the most debated topics in recreational fisheries science. The evidence base is nuanced:

**What is scientifically supported:**
- Fish with physostomous (open) swim bladders (trout, salmon, pike, catfish) can rapidly adjust buoyancy and are less affected by pressure changes. Fish with physoclistous (closed) swim bladders (largemouth bass, bluegill, perch, walleye) experience buoyancy disruption during rapid pressure changes and must expend energy to maintain position (Alexander 1966, *Physiological Mechanisms of Animal Buoyancy*, Pergamon Press).
- Rapid pressure drops associated with approaching weather fronts do correlate with increased pre-storm feeding activity in multiple species (Kuparinen et al. 2016, *Oecologia* 180:573-583; although these authors attribute the effect more to the associated environmental changes — cloud cover, wind, turbidity — than to pressure per se).
- Laboratory studies show measurable behavioral changes in fish at pressure change rates as low as 1-2 hPa/hr (Tøsdal & Moland 2014, referenced in behavioral ecology literature).

**What is NOT supported:**
- The specific multiplier magnitudes (1.25 for rapidly falling, 0.70 for rapidly rising) are **entirely fabricated heuristics** with no empirical calibration. No published study provides quantitative feeding-rate multipliers as a function of pressure trend.
- The "storm approaching → aggressive feed" narrative is widely repeated in popular fishing literature but has **mixed scientific support**. Some controlled studies find no significant correlation between barometric pressure alone and feeding activity when temperature and light are controlled (Graham & Orth 1986, *Transactions of the American Fisheries Society* 115:648-652, found seasonal and diel patterns far more important than pressure).
- The effect of pressure on fish behavior is **confounded with temperature, wind, and light changes** that accompany pressure systems. Isolating a pure barometric effect is extremely difficult.

The spec's proposal to wire the `sensitivity` field so that different species get different pressure response magnitudes is **biologically correct in direction** — physoclistous species and species with high lateral line development (walleye, crappie) are more pressure-sensitive. But the spec does not propose how to calibrate the specific scaling factors, and the sensitivity labels (High/Medium/Low) are themselves uncited.

**Verdict:** The conceptual model is defensible. The specific multiplier values are unsupported. The species-sensitivity differentiation is directionally correct but uncalibrated.

---

### 2.4 Dissolved Oxygen Model (Spec Proposal — Wind-Driven Mixing Matrix)

**Claim:** A wind-driven mixing matrix incorporating wind speed and water temperature will model oxygen dissolution and wind-driven surface mixing, described as "more scientifically rigorous than a pure seasonal proxy."

**Validity: PARTIALLY VALID — but overstated**

**Reasoning:**

The science of dissolved oxygen in aquatic systems is extremely well-established:

- **Temperature dependence of DO saturation:** The Weiss (1970, *Deep-Sea Research* 17:721-735) equations provide precise DO saturation values as a function of temperature and salinity. At sea level, DO saturation drops from ~14.6 mg/L at 0°C to ~7.5 mg/L at 30°C to ~6.2 mg/L at 40°C (Benson & Krause 1984, *Water Resources Research* 20:190-194). This inverse relationship is foundational limnology.

- **DO thresholds for fish:** Below 4 mg/L, most temperate gamefish exhibit reduced feeding (Kramer 1987, *Environmental Biology of Fishes* 18:81-92). Below 2 mg/L, most species enter survival mode. These thresholds are species-specific: trout and salmon have high DO requirements (preferred >6 mg/L), while catfish and bullhead tolerate levels as low as 1-2 mg/L (Masser et al. 1991, *Southern Regional Aquaculture Center Publication* 3700).

- **Wind-driven mixing:** Wind contributes turbulent kinetic energy to the surface layer, enhancing gas exchange (the "piston velocity" or "gas transfer velocity" — Wanninkhof 1992, *Journal of Geophysical Research* 97:7373-7382). Higher wind speed increases the rate of O₂ exchange across the air-water interface. This is valid physical limnology.

**The problem with the spec's proposal:**

A "wind-driven mixing matrix" that uses **wind speed and water temperature** from a **weather API** to estimate DO in a **specific body of water** is attempting to model a **lake-specific, depth-specific, biology-specific parameter** from **regional atmospheric data**. This is fundamentally limited:

1. **DO in lakes is controlled by biological oxygen demand (BOD), stratification, hypolimnetic demand, primary production (photosynthesis adds O₂), and respiration** — not just wind mixing and temperature (Wetzel 2001, *Limnology: Lake and River Ecosystems*, 3rd ed., Academic Press). A weather-API-based model cannot capture any of these.

2. **The actual DO at the depth where fish are located** is controlled by the thermocline structure, which the spec proposes to also estimate — but the two estimates will be coupled and potentially compounding each other's errors.

3. **Without any measured DO data, the model output is a proxy of a proxy.** Calling it a "mixing matrix" implies a level of physical modeling (turbulent diffusion coefficients, Schmidt stability, Wedderburn number) that is not achievable from wind speed and temperature alone.

4. The spec says it uses "seasonal/latitudinal models" for DO — then in Resolved Decision 2, upgrades this to a "wind-driven mixing matrix." Neither approach can produce mg/L estimates with meaningful accuracy without site-specific calibration data (lake morphometry, productivity, oxygen demand).

**What the spec gets right:** Acknowledging DO as critical. Using temperature-based saturation limits. Species-specific DO tolerance thresholds (proposed in species data expansion).

**What the spec overstates:** Calling this a scientifically rigorous model. The honest characterization is: "a seasonal and weather-informed proxy that flags conditions under which DO stress is likely."

**Verdict:** The direction is correct and DO must be included. But the model as described will produce **spurious precision** — it implies DO estimates that the input data cannot support. The model should be framed explicitly as a **risk indicator** ("DO stress conditions likely") rather than a quantitative DO estimate.

---

### 2.5 Spawning Cycle Model (Spec Proposal)

**Claim:** Species-specific spawning temperature windows that modulate feeding behavior, with pre-spawn (aggressive feeding), active spawn (reduced feeding), and post-spawn (recovery) phases.

**Validity: VALID**

**Reasoning:**

This is the most well-supported proposal in the specification. Spawning behavior modulation of feeding is extensively documented in fisheries science:

- **Pre-spawn hyperphagia:** Fish accumulate energy reserves before spawning. Largemouth bass feed aggressively in the pre-spawn period as water temperatures rise through the 55-62°F range (Ridgway et al. 1991, *Canadian Journal of Fisheries and Aquatic Sciences* 48:2440-2451). This is among the most reliable feeding triggers in recreational fishing.

- **Spawning cessation:** Nest-guarding species (centrarchids — bass, sunfish, crappie) dramatically reduce or cease feeding during the active spawn. Largemouth bass males guarding nests feed very little for 1-2 weeks (Coble 1975, *Journal of the Fisheries Research Board of Canada* 32:1675-1678).

- **Post-spawn recovery:** After spawning, fish enter a recovery period with variable feeding motivation. For bass, this is often 1-3 weeks of reduced activity (Philipp et al. 1997, *Transactions of the American Fisheries Society* 126:829-838).

- **Species-specific spawning temperatures** are well-documented in agency reports and textbooks:
  - Largemouth Bass: 63-68°F (Carlander 1977, *Handbook of Freshwater Fishery Biology*, Vol. 2)
  - Walleye: 42-50°F (Scott & Crossman 1973, *Freshwater Fishes of Canada*)
  - Crappie: 60-65°F
  - Bluegill: 67-70°F
  - Channel Catfish: 75-80°F
  - Northern Pike: 40-52°F
  - Muskellunge: 55-60°F

The spec correctly notes that spawning timing varies by latitude — this is well-established (phylogenetic and latitudinal variation in spawning cues, largely driven by photoperiod and temperature thresholds).

**One concern:** The spec proposes species data with spawning temperatures from "most recent publications from the last 10 years." This is good practice, but the spawning temperature ranges for common North American sport fish have been stable in the literature for decades — recent papers refine rather than revolutionize these numbers. The more important addition would be **spawning window duration** and **post-spawn recovery duration**, which are more variable and less well-documented for some species.

**Verdict:** Scientifically well-founded. This is the strongest new model proposed. The biological basis is unambiguous.

---

### 2.6 Thermocline Depth Estimation (Spec Proposal)

**Claim:** Model uses latitude, date, surface temperature, and wind speed to estimate thermocline depth, incorporating wind-driven mixing.

**Validity: PARTIALLY VALID — with significant caveats**

**Reasoning:**

Thermocline dynamics are well-understood in limnology (Hutchinson 1957, *A Treatise on Limnology*, Vol. 1; Wetzel 2001):

- In temperate lakes, summer stratification produces a three-layer system: epilimnion (warm, mixed), metalimnion (thermocline — rapid temperature decline), hypolimnion (cold, dense, often oxygen-depleted).
- Thermocline depth is influenced by lake surface area (fetch), wind exposure, latitude (via solar radiation), and lake morphometry.
- Wind energy input directly affects the depth of the mixed layer (epilimnion thickness) — this is modeled by the Wedderburn number and Lake Number (Imberger & Patterson 1990, *Advances in Applied Mechanics* 27:303-475).

**The fundamental problem:** Thermocline depth is **lake-specific**. Two lakes at the same latitude, same date, same air temperature, same wind speed can have thermocline depths differing by 5-10 meters depending on:
- Lake surface area and fetch (a 100-acre lake and a 10,000-acre lake have very different mixing depths)
- Lake maximum depth
- Water clarity (affects solar radiation penetration and heating depth — the Secchi depth relationship)
- Basin shape and bathymetry
- Inflow/outflow volumes
- Productivity (algal blooms absorb heat in the photic zone)

The spec proposes estimating thermocline depth from **latitude, date, surface temperature, and wind speed** — none of which capture lake morphometry. This is analogous to estimating ocean depth from beach sand temperature. The approach can identify **whether stratification is likely** (warm surface temp + summer + calm winds = probably stratified), but it cannot estimate **thermocline depth** with any meaningful accuracy.

A more honest framing: "The model predicts whether a lake is likely to be stratified and adjusts fish depth distribution expectations accordingly, but cannot determine actual thermocline depth without lake-specific data."

**Verdict:** The concept (acknowledging stratification and its effect on fish distribution) is valid. Estimating actual thermocline depth from the proposed inputs is not achievable with meaningful accuracy. The wind data incorporation is a nice touch but insufficient to overcome the missing morphometry variables.

---

### 2.7 Lunar / Solunar Model (Spec Proposal)

**Claim:** Moon phase should be computed deterministically rather than generated by AI. The engine should include a lunar module.

**Validity: VALID for the computation approach; DEBATED for biological effect**

**Reasoning:**

- **Deterministic computation:** Absolutely correct. Moon phase is a deterministic astronomical calculation. There are well-established algorithms (Meeus 1991, *Astronomical Algorithms*, Willmann-Bell). Computing it rather than asking an LLM is unambiguously the right approach. The spec is correct here.

- **Biological effect of moon phase on freshwater fish:** This is where the science gets murky:

  - **Solunar theory** (John Alden Knight, 1936, *Moon Up*, is the original popular source) posits that moon position creates "major and minor feeding periods." The scientific evidence is **weak and inconsistent** for freshwater fish. A systematic review by Newton (2008, available in fisheries agency reports) found no robust evidence for solunar feeding periods in controlled studies.

  - **Lunar illumination effects** are better supported: Bright moonlight at night can increase feeding efficiency of visual predators (Largemouth Bass — McMahon & Holanov 1995, *Transactions of the American Fisheries Society* 124:612-618) but may suppress feeding in prey species or species that rely on darkness for cover.

  - **Tidal effects** are irrelevant for the freshwater species in this engine, except for anadromous/tidal-influenced species (Striped Bass, some catfish populations).

  - The spec is wise to propose computing moon phase deterministically rather than relying on solunar theory. If the lunar module is used, it should be framed as a **minor modifier based on moonlight illumination** (well-supported for nocturnal/crepuscular predators), not as solunar major/minor period theory.

**Verdict:** Deterministic computation is correct. Biological effect should be treated cautiously — use moonlight illumination for nocturnal species, avoid claiming solunar theory is scientifically validated.

---

### 2.8 Photoperiod Model (Spec Proposal)

**Claim:** Photoperiod (day length) is added as a bonus multiplier supplementing existing static time-of-day windows.

**Validity: VALID**

**Reasoning:**

Photoperiod is one of the most powerful zeitgebers (environmental cues entraining biological rhythms) in fish physiology. It controls:
- Circannual rhythms (seasonal behavior shifts, reproductive cycles, migration)
- Circadian entrainment (shifting of dawn/dusk activity peaks with season)
- Gonadal development and spawning timing

The relationship between photoperiod and fish behavior is established in chronobiology (Bromage et al. 2001, *Aquaculture* 197:63-77; reviewed in Falcón et al. 2010, *General and Comparative Endocrinology* 165:37-46). Fish do shift their activity periods with seasonal changes in day length — a 5 AM bite window in June (coinciding with dawn) does not correspond to a 5 AM bite in December (pre-dawn darkness).

The spec's decision to implement photoperiod as a **supplementary layered approach** (bonus multiplier on top of static time windows) is conservative but scientifically reasonable for a first implementation. A more rigorous approach would replace the static windows entirely with actual sunrise/sunset-based activity windows, but the spec acknowledges this tradeoff explicitly (Resolved Decision 7).

**Day length calculation** from latitude and date is straightforward using standard astronomical formulas (standard declination equation, hour angle). The spec does not specify the exact algorithm, but any standard solar position calculation will work.

**Verdict:** Scientifically well-founded. Conservative implementation approach is defensible.

---

### 2.9 Confidence Bands (Spec Proposal)

**Claim:** Dynamic confidence bands based on multiplier spread — narrow (~5%) when multipliers agree and are moderate, wider (~12%) when conditions are extreme or volatile.

**Validity: PARTIALLY VALID — conceptually right, methodologically unsupported**

**Reasoning:**

The **concept** is correct and scientifically honest. Any heuristic forecast should communicate uncertainty. Presenting a single precise number ("62%") implies a precision the model does not possess. The science review report correctly identifies this as a problem.

The **method** proposed is arbitrary. "Multiplier spread" — the variance or range among the environmental multipliers — is used as a proxy for uncertainty. This has intuitive appeal (if wind says "good" but pressure says "bad," uncertainty is higher), but:

1. There is no mathematical or statistical basis for mapping multiplier spread to a percentage range. The 5-12% range is itself a magic number.

2. The actual uncertainty in the model comes from: (a) the heuristic nature of all multipliers (structural uncertainty), (b) the estimation error in water temperature (measurement uncertainty), (c) the proxy nature of DO/thermocline models (model uncertainty), and (d) the inherent unpredictability of fish behavior (aleatory uncertainty). Multiplier spread captures none of these systematically.

3. A scientifically defensible confidence band would require either: (a) calibration against catch data to establish empirical error distributions, or (b) a Bayesian framework where each multiplier carries its own uncertainty that propagates through the model.

**Verdict:** The direction is right — uncertainty should be communicated. The method is a reasonable heuristic for a heuristic model. But it should not be called a "confidence band" in the statistical sense — it is an **uncertainty indicator** based on model-internal disagreement.

---

### 2.10 Water Temperature Estimation (Existing — Spec Patches)

**Claim:** Hybrid model combining 70% seasonal baseline + 30% current air temperature provides a stable water temperature estimate.

**Validity: PARTIALLY VALID**

**Reasoning:**

The thermal lag concept is physically sound — water has high specific heat capacity (~4.186 J/g·K) and responds to atmospheric heating/cooling with a lag of days to weeks depending on water body size and depth.

However, the specific 70/30 weighting is **arbitrary and uncalibrated**. The actual relationship between air and water temperature varies enormously by:
- Water body size and depth (a farm pond responds to air temperature much faster than Lake Superior)
- Flow regime (rivers track air temperature more closely than lakes)
- Wind exposure
- Groundwater inputs

Published air-water temperature regression models exist (Mohseni et al. 1998, *Water Resources Research* 34:2309-2319, developed a nonlinear air-water temperature model for streams) and could provide a more defensible formula. The spec does not propose adopting any published model — it merely suggests "latitude-adjusted baselines" for the existing hardcoded temperate-North-American values.

The latitude adjustment is directionally correct (southern lakes are warmer, northern lakes are colder, at the same time of year), but the spec does not provide the latitude adjustment function or its derivation.

**Verdict:** The hybrid model is a reasonable engineering compromise. The 70/30 weighting is unsupported. Latitude adjustment is a correct direction. The spec should cite and optionally adopt Mohseni et al. (1998) or similar published air-water temperature models.

---

### 2.11 Species-Specific Nocturnal Multipliers (Spec Proposal)

**Claim:** Nocturnal species (walleye, catfish, brown trout) should have night multipliers > 1.0.

**Validity: VALID**

**Reasoning:**

This is well-supported by sensory ecology:

- **Walleye** have a tapetum lucidum and rod-dominated retinas specialized for low-light conditions (Ali & Anctil 1968, *Journal of the Fisheries Research Board of Canada* 25:1801-1806). They are crepuscular/nocturnal feeders (Craig 1987, *The Biology of Perch and Related Fish*, Croom Helm).

- **Channel Catfish** and bullheads have extensive external taste buds and barbels, making them highly effective nocturnal/olfactory feeders (Caprio 1988, *Sensory Biology of Aquatic Animals*, Springer).

- **Brown Trout** are more nocturnal than other trout species, especially in summer and in large-river populations (Railsback et al. 2005, *Transactions of the American Fisheries Society* 134:1354-1366).

The current engine penalizes all species at night (0.85 multiplier) — this is biologically incorrect for these species. The fix is straightforward and well-justified.

**Verdict:** Strongly supported by fish sensory ecology and behavior literature.

---

### 2.12 Lure Seasonal/Temperature Filtering (Spec Proposal)

**Claim:** Lure scorer should filter by season and temperature using existing `seasons` and `temperature_band` fields — preventing recommendations like topwater in 38°F water.

**Validity: VALID**

**Reasoning:**

This is straightforward applied biology. Fish metabolism and prey availability are temperature-dependent. Topwater lures imitate surface prey (frogs, insects, injured baitfish) that are not available or active in cold water. Cold-water feeding is dominated by slow-moving prey near the bottom.

The existing lure data already has `seasons`, `temperature_band`, `light`, and `depth` fields that are **never used** by the scorer — the current scorer only considers species match, strategy type, and water clarity. Implementing these filters is not novel science but good engineering.

**Verdict:** Correct and necessary. No scientific concern.

---

### 2.13 Bite Score Architecture: Multiplicative Model

**Claim:** The multiplicative architecture (metabolic base × pressure factor × environmental adjustment) is a sound framework for combining environmental effects on feeding probability.

**Validity: PARTIALLY VALID — with structural concerns**

**Reasoning:**

The multiplicative combination of environmental factors is a common approach in ecological modeling (e.g., habitat suitability indices — HSI models used by USFWS, 1981, *Standards for the Development of Habitat Suitability Index Models*). It assumes that each factor independently influences the probability of feeding, and that these influences compound multiplicatively.

**Structural problems:**

1. **Independence assumption violated:** The multipliers are not independent. Water temperature affects DO solubility, which affects metabolic rate, which affects feeding motivation. Wind affects turbidity, which affects light, which affects visual feeding. Correlated factors multiplied together **double-count their shared variance**, producing inflated or deflated scores with no clear direction of bias.

2. **No interaction terms:** Some environmental factors interact synergistically (e.g., warm water + low DO is far worse than either alone). A purely multiplicative model without interaction terms cannot capture these threshold effects.

3. **No validation against any criterion variable:** The model produces a "bite probability" that has never been compared to actual catch rates, electrofishing CPUE, or any other empirical measure of fish activity. The spec explicitly defers calibration (Assumption 4). Without calibration, the output is a **dimensionless score**, not a probability.

The spec does not address this fundamental issue. It improves the inputs (adding DO, spawning, thermocline) and fixes the transformation (removing 4th root, adding confidence bands) but does not address the core problem that **the model has never been validated**.

**Verdict:** The architecture is common in ecological modeling but comes with assumptions that are violated here. The most important scientific limitation of the entire system — that it is uncalibrated — is not addressed by this spec.

---

### 2.14 EMA Temporal Smoothing

**Claim:** EMA smoothing (α=0.6) prevents erratic score jumps between queries for the same location.

**Validity: VALID — but with a conceptual issue**

**Reasoning:**

Exponential Moving Average is a standard signal processing technique. The smoothing is reasonable for preventing jitter in user-facing scores.

However, the EMA is applied across **sequential user queries for the same location** — not across actual time intervals. If no one queries the system for 6 hours, then someone queries, the EMA blends the new score with one from 6 hours ago as if they were adjacent in time. This is not standard time-series smoothing — it is query-sequence smoothing. The 3-hour staleness threshold partially mitigates this, but the conceptual issue remains: the smoothing operates on **query frequency**, not **temporal distance**.

A scientifically defensible temporal smoothing would use actual time-weighted interpolation (e.g., decay function based on elapsed time, not a fixed α applied to adjacent queries).

**Verdict:** Pragmatically reasonable but scientifically imprecise. The smoothing conflates query frequency with temporal proximity.

---

## 3. Key Scientific Concerns

### 3.1 CRITICAL — Fundamental: No Calibration Against Empirical Data

The spec explicitly states: "No catch-data calibration in this spec" (Assumption 4). This means the entire model — existing and proposed — remains **unvalidated**. Every multiplier, threshold, and formula produces outputs that have never been compared to real-world fish catch rates, behavioral observations, or telemetry data.

The "bite probability" output is not a probability in any statistical sense — it is a **dimensionless composite score** mapped to a 0-100 scale. Adding more factors (DO, spawning, thermocline) to an uncalibrated model does not make it more accurate — it makes it **more complex and uncalibrated**.

The spec should include at minimum a **validation framework**: define what data would be needed for calibration (angler catch reports, creel surveys, telemetry-derived activity data), and include a plan for future calibration even if calibration itself is deferred.

### 3.2 CRITICAL — T_max Formula Is Quantitatively Wrong

As detailed in Section 2.1, the T_max = T_opt + 0.5 × range formula underestimates actual CTMax for most species by 10-15°F. The spec correctly identifies this and proposes species-specific UILT values, which is the right fix. Published CTMax values are available for most North American sport fish (Beitinger et al. 2000; Elliot 1981, *Journal of Animal Ecology* 50:803-814 for salmonids).

### 3.3 MODERATE — DO and Thermocline Models Will Produce Spurious Precision

As detailed in Sections 2.4 and 2.6, these models attempt to estimate lake-specific parameters from regional weather data. The outputs will be **point estimates with large unknown errors**. Presenting these to users as quantitative values (e.g., "DO: 5.2 mg/L, Thermocline: 18 ft") creates false confidence. These should be presented as **qualitative risk indicators** ("DO stress conditions likely," "thermocline probably present at moderate depth").

### 3.4 MODERATE — Multiplicative Independence Assumption

The multiplicative model architecture assumes environmental factors are independent. They are not (temperature correlates with DO, wind correlates with turbidity, cloud cover correlates with pressure). Multiplying correlated factors compounds their effects in ways that have no biological justification.

### 3.5 MODERATE — Pressure Multipliers Are Fabricated

The pressure trend multipliers (0.70 to 1.25) are entirely heuristic with no empirical calibration. The spec proposes wiring species sensitivity, but does not propose calibrating the actual values.

### 3.6 MINOR — Metabolic Curve JSDoc Overstates Scientific Basis

The JSDoc comment claims consistency with "Q10 temperature coefficients and aerobic scope" but neither Q10 nor aerobic scope is actually computed or referenced in the formula. The curve shapes (smoothstep, cubic decay) are convenience functions, not physiological models.

### 3.7 MINOR — EMA Smoothing Conflates Query Frequency with Temporal Proximity

The temporal smoothing operates on sequential queries, not actual time intervals. This means the smoothing depth depends on how often the system is queried for a location, not on how much time has elapsed.

### 3.8 MINOR — Pressure Trend Thresholds Are Uncited

The classification thresholds (±0.3 hPa/hr for "Falling/Rising," ±1.0 hPa/hr for "Rapidly Falling/Rising") are plausible but uncited. Standard meteorological definitions use 1 hPa/3hr as a threshold for significant pressure change, which is approximately 0.33 hPa/hr — the spec's ±0.3 threshold is consistent with this, but the source should be cited.

---

## 4. Strengths

The specification and the underlying engine have several scientifically defensible elements:

1. **Correct identification of critical missing factors.** DO, spawning cycles, and thermocline depth are indeed the three most important missing variables for fish activity prediction. The prioritization (spawning > DO > thermocline in terms of biological impact) is defensible.

2. **Honest acknowledgment of heuristic nature.** The science review report's assessment that the engine "models ~40% of the major factors" and the spec's inclusion of a "methodology disclaimer" success criterion show appropriate scientific humility.

3. **Preservation of existing architecture.** Rather than rewriting the engine, the spec proposes incremental enhancements. This is sound engineering and reduces the risk of introducing new errors.

4. **Species-specific data expansion.** Adding spawning temperatures, DO tolerance, preferred depth, forage base, and turbidity preference to the species data schema is a major improvement. These data are available in established fisheries references (Carlander 1969, 1977; Scott & Crossman 1973; state DNR species profiles).

5. **Deterministic lunar computation.** Moving moon phase from LLM hallucination to deterministic calculation is unambiguously correct.

6. **Confidence bands.** Even though the method is imperfect, communicating uncertainty to users is scientifically more honest than presenting a precise number.

7. **Nocturnal species multipliers.** This fix is strongly supported by fish sensory ecology and fixes a clear biological error.

8. **Temperature source flagging.** Distinguishing USGS-live vs estimated water temperature is good scientific practice — it communicates data quality to the user.

9. **Lure seasonal/temperature filtering.** Using existing data fields that were previously ignored is straightforward and prevents biologically nonsensical recommendations.

10. **Testing discipline.** Requiring unit tests for every new function and citation for every magic number is good scientific methodology — it creates traceability and reproducibility.

---

## 5. Recommendations

### P0 — Before Implementation

| # | Recommendation | Rationale |
|---|----------------|----------|
| 1 | **Reframe DO and thermocline models as qualitative risk indicators** rather than quantitative estimates. | Lake-specific parameters cannot be estimated from regional weather data with meaningful accuracy. Present "DO stress likely" and "stratification expected" rather than specific mg/L values or depth estimates. |
| 2 | **Use published CTMax values** from Beitinger et al. (2000) or USGS species profiles for species-specific T_max. Do not use the T_opt + 0.5 × range formula. | The current formula underestimates CTMax by 10-15°F for most species. Published data exists for all 20 species. |
| 3 | **Adopt a published air-water temperature regression model** (e.g., Mohseni et al. 1998) for the water temperature estimation fallback instead of the uncited 70/30 hybrid. | Published models have been validated against empirical data and account for the nonlinear relationship. |
| 4 | **Remove Q10 and aerobic scope references** from the metabolic model JSDoc unless these concepts are actually computed. | The current JSDoc claims scientific basis that the formula does not implement. |

### P1 — Structural Improvements

| # | Recommendation | Rationale |
|---|----------------|----------|
| 5 | **Include a calibration roadmap** as part of the spec, even if calibration is deferred. Define: what calibration data is needed, what statistical method will be used (logistic regression against catch/no-catch outcomes, or ordinal regression against CPUE), and what success metric will define a "validated" model. | Without calibration, adding more factors increases complexity without improving accuracy. |
| 6 | **Consider a logistic output layer** instead of the current linear scaling. The final score should pass through a sigmoid function that maps the composite score to a 0-1 probability range. | A sigmoid naturally handles the compounding effect of multiplicative factors and prevents saturation. This is standard in species distribution models (Elith & Leathwick 2009, *Trends in Ecology & Evolution* 24:33-42). |
| 7 | **Fix the EMA to be time-weighted.** Use an exponential decay function based on actual elapsed time (e.g., weight = exp(-Δt / τ) where τ is a time constant), not a fixed α applied to sequential queries. | Temporal smoothing should reflect actual time intervals, not query frequency. |
| 8 | **For pressure multipliers, cite or calibrate.** Either cite a published pressure-feeding relationship or explicitly label the multipliers as "uncalibrated heuristics" in both code comments and user-facing methodology. | Current multipliers are fabricated. They may be reasonable, but should not imply empirical derivation. |

### P2 — Enhancements

| # | Recommendation | Rationale |
|---|----------------|----------|
| 9 | **Add species-specific DO tolerance thresholds** from published literature. EPA criteria documents (e.g., EPA 1986, *Quality Criteria for Water*) and state water quality standards provide species-specific DO thresholds. | The proposed species data expansion includes DO tolerance but the spec doesn't specify sources. |
| 10 | **Frame the lunar module around moonlight illumination** for nocturnal species, not solunar feeding periods. | Moonlight effects on nocturnal feeding are better supported than solunar theory. |
| 11 | **Add water body type as an input** (lake vs river vs pond vs reservoir). This would improve DO, thermocline, and water temperature estimation. | Lake morphometry and flow regime fundamentally affect all three of these parameters. Water body type is easy for the user to specify and would significantly improve proxy model accuracy. |
| 12 | **Validate spawning temperature windows** against recent state DNR/agency spawning reports, not just Carlander (1969/1977). | Regional variation in spawning timing can be significant. State agency data provides regionally-specific temperature windows. |

### P3 — Documentation and Transparency

| # | Recommendation | Rationale |
|---|----------------|----------|
| 13 | **Label all heuristic values explicitly.** Every multiplier, threshold, and formula that is not derived from a specific publication should be labeled as "[Source: heuristic, uncalibrated]" in code and documented in user-facing methodology. | Scientific honesty requires distinguishing data-derived values from designer assumptions. |
| 14 | **Rename "Bite Probability" to "Bite Activity Index" or "Feeding Activity Score"** in user-facing output. | The model is not calibrated to produce a statistical probability. Calling it a probability implies statistical validity that does not exist. |
| 15 | **Include a model card** (like an ML model card — Mitchell et al. 2019, *Proceedings of the Conference on Fairness, Accountability, and Transparency*) documenting: model architecture, inputs, outputs, training data (none), validation status (unvalidated), known limitations, intended use. | Transparency about model capabilities and limitations is standard practice in responsible AI/ML deployment. |

---

## Summary Table

| Component | Verdict | Key Issue |
|---|---|---|
| Metabolic model (existing) | Partially Valid | Convenience curve shapes, not physiological; T_max formula wrong by ~15°F |
| 4th-root removal | Valid | Correct analysis; needs calibration plan for replacement |
| Barometric pressure model | Partially Valid | Direction correct; multiplier values fabricated; effect size debated in literature |
| DO model (wind-driven mixing) | Partially Valid | Concept correct; cannot estimate mg/L from weather data; should be risk indicator |
| Spawning model | Valid | Strongest proposal; well-supported by fisheries literature |
| Thermocline estimation | Partially Valid | Concept valid; cannot estimate depth without lake morphometry |
| Lunar computation | Valid | Deterministic computation correct; biological effect should be moonlight-based |
| Photoperiod model | Valid | Well-supported; conservative implementation is defensible |
| Confidence bands | Partially Valid | Concept right; method is arbitrary, not statistically grounded |
| Water temp estimation | Partially Valid | Thermal lag concept sound; 70/30 weighting uncited; use published regression |
| Nocturnal multipliers | Valid | Strongly supported by sensory ecology |
| Lure seasonal filtering | Valid | Straightforward and necessary |
| Multiplicative architecture | Partially Valid | Common in ecology; independence assumption violated; no validation |
| EMA smoothing | Partially Valid | Pragmatic; conflates query frequency with temporal proximity |

---

## Final Assessment

The Science Engine Overhaul specification is a **competent engineering document** that identifies the right problems and proposes directionally correct solutions. It would make the FishSmart Pro engine more complete, more transparent, and more biologically informed.

However, it should not be mistaken for a path to scientific rigor. The fundamental limitation — **an uncalibrated multiplicative heuristic model** — is not addressed. Two of the most ambitious new models (DO and thermocline) attempt to estimate lake-specific parameters from regional weather data, which is not scientifically achievable with meaningful precision. Several existing claims (Q10 basis, pressure multiplier magnitudes, 70/30 water temperature weighting) overstate their scientific basis.

The spec's greatest scientific contribution is the **inclusion of spawning cycles** — this is the single change that would most improve real-world forecast accuracy, because spawning behavior is the most powerful and predictable behavioral modulator in fish biology.

The spec's greatest scientific risk is **adding complexity to an uncalibrated model** without a validation framework. More factors in an uncalibrated multiplicative model do not produce more accuracy — they produce more sophisticated-looking uncertainty.

**Recommendation:** Implement the spec with the modifications recommended above, particularly reframing DO/thermocline as qualitative indicators, using published CTMax values, and including a calibration roadmap. Then prioritize empirical validation as the immediate next project after this overhaul ships.

---

*Review conducted: 2026-06-23 | Independent scientific audit | Documents reviewed in full*

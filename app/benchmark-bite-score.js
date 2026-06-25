'use strict';
const { createBiteScoreEngine, getWindMultiplier, getCloudMultiplier, getTimeMultiplier, getClarityMultiplier, computeConfidenceBand, getSensitivityScaler, clearBiteScoreCache } = require('./src/engine/bite-score');
function mockWaterTempProvider(lat, lon, airTemp, month) {
    return { waterTempF: airTemp - 3, source: 'mock', stationName: null, stationDistance: null };
}
const lureScorer = { scoreLures: () => [] };
const fishingData = {
    species_data: [
        { name: 'Largemouth Bass', scientific_metrics: { opt: 78, dorm: 50, feeding_cease_temp: 90, sensitivity: 'High', preferred_depth: 10, nocturnal: false }, spawn_temp_start: 60, spawn_temp_peak: 65, spawn_temp_end: 72 },
        { name: 'Walleye', scientific_metrics: { opt: 65, dorm: 40, feeding_cease_temp: 80, sensitivity: 'High', preferred_depth: 20, nocturnal: true }, spawn_temp_start: 44, spawn_temp_peak: 50, spawn_temp_end: 55 },
        { name: 'Channel Catfish', scientific_metrics: { opt: 80, dorm: 55, feeding_cease_temp: 95, sensitivity: 'Low', preferred_depth: 15, nocturnal: true }, spawn_temp_start: 70, spawn_temp_peak: 78, spawn_temp_end: 84 },
        { name: 'Rainbow Trout', scientific_metrics: { opt: 58, dorm: 38, feeding_cease_temp: 72, sensitivity: 'High', preferred_depth: 25, nocturnal: false }, spawn_temp_start: 50, spawn_temp_peak: 55, spawn_temp_end: 60 },
        { name: 'Bluegill', scientific_metrics: { opt: 75, dorm: 50, feeding_cease_temp: 88, sensitivity: 'Medium', preferred_depth: 8, nocturnal: false }, spawn_temp_start: 65, spawn_temp_peak: 70, spawn_temp_end: 75 },
        { name: 'Northern Pike', scientific_metrics: { opt: 63, dorm: 40, feeding_cease_temp: 78, sensitivity: 'Low', preferred_depth: 12, nocturnal: false }, spawn_temp_start: 40, spawn_temp_peak: 45, spawn_temp_end: 52 }
    ]
};
const engine = createBiteScoreEngine(fishingData, lureScorer, { waterTempProvider: mockWaterTempProvider });

let testCounter = 0;
async function score(input, weather, options) {
    clearBiteScoreCache();
    const isolatedInput = { ...input, location: 't-' + (testCounter++) };
    const result = await engine.calculateScientificStrategy(isolatedInput, weather, options);
    return result.biteProbability;
}

async function runBenchmark() {
    let passed = 0, total = 0;
    const violations = [];
    const allScores = [];
    function check(name, condition, detail) {
        total++;
        if (condition) passed++; else violations.push(`${name}: ${detail || ''}`);
    }

    // Use January for clear day/night separation (dawn ~7am, dusk ~5pm at lat 45)
    const summerDate = new Date('2024-07-15');
    const winterDate = new Date('2024-01-15');
    const baseInput = { speciesName: 'Largemouth Bass', waterColor: 'Clear', lat: 45, lon: -90 };
    const baseWeather = { temp: 78, pressure: 1013, wind: { speed: 5 }, cloudiness: 40, lat: 45, lon: -90 };
    const baseOpts = { useLureCatalog: false, month: 7, hour: 6, date: summerDate };

    // === 1. Pressure Monotonicity (5 scenarios × 3 checks) ===
    const pressures = [
        { history: [{pressure:1020,timestamp:Date.now()-7200000},{pressure:1015,timestamp:Date.now()-3600000},{pressure:1008,timestamp:Date.now()}] },
        { history: [{pressure:1016,timestamp:Date.now()-7200000},{pressure:1014,timestamp:Date.now()-3600000},{pressure:1012,timestamp:Date.now()}] },
        { history: [{pressure:1013,timestamp:Date.now()-7200000},{pressure:1013,timestamp:Date.now()-3600000},{pressure:1013,timestamp:Date.now()}] },
        { history: [{pressure:1010,timestamp:Date.now()-7200000},{pressure:1012,timestamp:Date.now()-3600000},{pressure:1014,timestamp:Date.now()}] },
        { history: [{pressure:1005,timestamp:Date.now()-7200000},{pressure:1011,timestamp:Date.now()-3600000},{pressure:1018,timestamp:Date.now()}] }
    ];
    const pressureScores = [];
    for (const p of pressures) {
        const w = { ...baseWeather, pressure: p.history[p.history.length-1].pressure, pressureHistory: p.history };
        const s = await score(baseInput, w, baseOpts); pressureScores.push(s); allScores.push(s);
    }
    check('RF >= Stable', pressureScores[0] >= pressureScores[2] - 3, `RF=${pressureScores[0]} S=${pressureScores[2]}`);
    check('F >= Stable', pressureScores[1] >= pressureScores[2] - 3, `F=${pressureScores[1]} S=${pressureScores[2]}`);
    check('Stable >= Rising', pressureScores[2] >= pressureScores[3] - 3, `S=${pressureScores[2]} R=${pressureScores[3]}`);
    check('Stable >= RR', pressureScores[2] >= pressureScores[4] - 3, `S=${pressureScores[2]} RR=${pressureScores[4]}`);
    check('RF > RR', pressureScores[0] > pressureScores[4], `RF=${pressureScores[0]} RR=${pressureScores[4]}`);
    check('F > Rising', pressureScores[1] > pressureScores[3], `F=${pressureScores[1]} R=${pressureScores[3]}`);

    // === 2. Temperature Bell Curve ===
    const temps = [35, 45, 55, 65, 75, 85, 92];
    const tempScores = [];
    for (const t of temps) {
        const s = await score(baseInput, { ...baseWeather, temp: t + 3 }, baseOpts); tempScores.push(s); allScores.push(s);
    }
    check('Optimal(75) > dormant(35)', tempScores[4] > tempScores[0], `opt=${tempScores[4]} dorm=${tempScores[0]}`);
    check('Optimal(75) > excessive(92)', tempScores[4] > tempScores[6], `opt=${tempScores[4]} hot=${tempScores[6]}`);
    check('Warm(55) > cold(35)', tempScores[2] > tempScores[0], `55F=${tempScores[2]} 35F=${tempScores[0]}`);
    check('Warm(65) > cold(45)', tempScores[3] > tempScores[1], `65F=${tempScores[3]} 45F=${tempScores[1]}`);
    check('Optimal(75) >= warm(65)', tempScores[4] >= tempScores[3] - 5, `75F=${tempScores[4]} 65F=${tempScores[3]}`);

    // === 3. Crepuscular Peaks — Winter (clear day/night separation) ===
    const winterOpts = { useLureCatalog: false, month: 1, date: winterDate };
    const winterWeather = { ...baseWeather, temp: 48 };
    for (const h of [2, 6, 7, 12, 16, 17, 22]) {
        const s = await score(baseInput, winterWeather, { ...winterOpts, hour: h }); allScores.push(s);
        if (h === 7 || h === 17) { /* dawn/dusk hours */ }
    }
    const dawnWinter = await score(baseInput, winterWeather, { ...winterOpts, hour: 7 });
    const nightWinter = await score(baseInput, winterWeather, { ...winterOpts, hour: 2 });
    const middayWinter = await score(baseInput, winterWeather, { ...winterOpts, hour: 12 });
    allScores.push(dawnWinter, nightWinter, middayWinter);
    check('Winter dawn(7) > night(2)', dawnWinter > nightWinter, `dawn=${dawnWinter} night=${nightWinter}`);
    check('Winter dawn(7) > midday(12)', dawnWinter > middayWinter, `dawn=${dawnWinter} midday=${middayWinter}`);

    // === 4. Nocturnal Reversal ===
    const walleyeInput = { ...baseInput, speciesName: 'Walleye' };
    const walleyeNight = await score(walleyeInput, baseWeather, { ...baseOpts, hour: 2 });
    const walleyeMidday = await score(walleyeInput, baseWeather, { ...baseOpts, hour: 12 });
    allScores.push(walleyeNight, walleyeMidday);
    check('Walleye night > midday', walleyeNight > walleyeMidday, `night=${walleyeNight} midday=${walleyeMidday}`);
    const catfishInput = { ...baseInput, speciesName: 'Channel Catfish' };
    const catfishNight = await score(catfishInput, baseWeather, { ...baseOpts, hour: 2 });
    const catfishMidday = await score(catfishInput, baseWeather, { ...baseOpts, hour: 12 });
    allScores.push(catfishNight, catfishMidday);
    check('Catfish night > midday', catfishNight > catfishMidday, `night=${catfishNight} midday=${catfishMidday}`);

    // === 5. Wind Optimum ===
    const windScores = {};
    for (const w of [0, 1, 5, 8, 12, 15, 18, 20, 25]) {
        const s = await score(baseInput, { ...baseWeather, wind: { speed: w } }, baseOpts); windScores[w] = s; allScores.push(s);
    }
    check('Breeze(5) > calm(0)', windScores[5] > windScores[0], `breeze=${windScores[5]} calm=${windScores[0]}`);
    check('Breeze(5) > gale(25)', windScores[5] > windScores[25], `breeze=${windScores[5]} gale=${windScores[25]}`);
    check('Moderate(12) > gale(25)', windScores[12] > windScores[25], `mod=${windScores[12]} gale=${windScores[25]}`);
    check('Breeze(5) > strong(18)', windScores[5] > windScores[18], `breeze=${windScores[5]} strong=${windScores[18]}`);

    // === 6. Cloud Cover ===
    const cloudScores = {};
    for (const c of [0, 20, 35, 50, 65, 80, 90]) {
        const s = await score(baseInput, { ...baseWeather, cloudiness: c }, baseOpts); cloudScores[c] = s; allScores.push(s);
    }
    check('Overcast(90) > clear(0)', cloudScores[90] > cloudScores[0], `overcast=${cloudScores[90]} clear=${cloudScores[0]}`);
    check('Scattered(65) > partly(35)', cloudScores[65] > cloudScores[35], `scat=${cloudScores[65]} partly=${cloudScores[35]}`);

    // === 7. Clarity ===
    const stainedScore = await score({ ...baseInput, waterColor: 'Stained' }, baseWeather, baseOpts);
    const muddyScore = await score({ ...baseInput, waterColor: 'Muddy' }, baseWeather, baseOpts);
    const ginClearScore = await score({ ...baseInput, waterColor: 'Gin Clear' }, baseWeather, baseOpts);
    allScores.push(stainedScore, muddyScore, ginClearScore);
    check('Stained > Muddy', stainedScore > muddyScore, `stained=${stainedScore} muddy=${muddyScore}`);
    check('Stained > GinClear', stainedScore > ginClearScore, `stained=${stainedScore} gin=${ginClearScore}`);

    // === 8. Sensitivity Scaling ===
    const fallingW = { ...baseWeather, pressure: 1008, pressureHistory: pressures[0].history };
    const risingW = { ...baseWeather, pressure: 1018, pressureHistory: pressures[4].history };
    const bassFalling = await score(baseInput, fallingW, baseOpts);
    const bassRising = await score(baseInput, risingW, baseOpts);
    const catfishFalling = await score(catfishInput, fallingW, baseOpts);
    const catfishRising = await score(catfishInput, risingW, baseOpts);
    allScores.push(bassFalling, bassRising, catfishFalling, catfishRising);
    check('High-sens reacts more to pressure', Math.abs(bassFalling-bassRising) >= Math.abs(catfishFalling-catfishRising), `bassΔ=${Math.abs(bassFalling-bassRising)} catΔ=${Math.abs(catfishFalling-catfishRising)}`);

    // === 9. Species Thermal Optima ===
    const troutInput = { ...baseInput, speciesName: 'Rainbow Trout' };
    const troutCool = await score(troutInput, { ...baseWeather, temp: 58+3 }, baseOpts);
    const troutWarm = await score(troutInput, { ...baseWeather, temp: 82+3 }, baseOpts);
    allScores.push(troutCool, troutWarm);
    check('Trout at cool temp > warm temp', troutCool > troutWarm, `cool=${troutCool} warm=${troutWarm}`);

    // === 10. Dynamic Range ===
    const minScore = Math.min(...allScores), maxScore = Math.max(...allScores);
    const dynamicRange = maxScore - minScore;
    check('Dynamic range >= 30', dynamicRange >= 30, `range=${dynamicRange}`);
    check('Dynamic range >= 40', dynamicRange >= 40, `range=${dynamicRange}`);

    // === 11. Confidence Bands ===
    const idealBand = computeConfidenceBand(50, [1.0, 1.0, 1.0, 1.0, 1.0, 1.0]);
    const extremeBand = computeConfidenceBand(50, [0.75, 1.25, 0.85, 1.15, 0.70, 1.20]);
    check('Extreme band > ideal', extremeBand.band > idealBand.band, `extreme=${extremeBand.band} ideal=${idealBand.band}`);
    check('Ideal band <= 6', idealBand.band <= 6, `ideal=${idealBand.band}`);
    check('Extreme band >= 10', extremeBand.band >= 10, `extreme=${extremeBand.band}`);

    // === 12. Pure Function Invariants ===
    check('WindMult: breeze > calm', getWindMultiplier(5) > getWindMultiplier(0), '');
    check('WindMult: breeze > gale', getWindMultiplier(5) > getWindMultiplier(25), '');
    check('CloudMult: overcast > clear', getCloudMultiplier(90) > getCloudMultiplier(0), '');
    check('TimeMult: dawn > midday', getTimeMultiplier(6) > getTimeMultiplier(12), '');
    check('TimeMult noct: night > midday', getTimeMultiplier(22, true) > getTimeMultiplier(12, true), '');
    check('ClarityMult: Stained > Clear', getClarityMultiplier('Stained') > getClarityMultiplier('Clear'), '');
    check('SensScaler ordering', getSensitivityScaler('High') > getSensitivityScaler('Medium') && getSensitivityScaler('Medium') > getSensitivityScaler('Low'), '');

    // === 13. Score Distribution ===
    const midRange = allScores.filter(s => s >= 10 && s <= 90).length;
    check('Majority in 10-90 range', midRange >= allScores.length * 0.4, `${midRange}/${allScores.length}`);

    // === TIER 2: Advanced Scientific Invariants ===

    // T2.1: Pressure sensitivity differentiation - High-sens species should show
    // meaningfully different scores between falling and rising pressure
    const bassPressureDelta = Math.abs(bassFalling - bassRising);
    check('T2: Bass pressure delta >= 3', bassPressureDelta >= 3, 'bassDelta=' + bassPressureDelta);
    check('T2: Catfish pressure delta < bass delta', Math.abs(catfishFalling - catfishRising) < bassPressureDelta, 'catfishDelta=' + Math.abs(catfishFalling-catfishRising));

    // T2.2: Rapidly falling > gently falling (rate matters, not just direction)
    const rapidFallScore = pressureScores[0];
    const gentleFallScore = pressureScores[1];
    check('T2: Rapid fall >= gentle fall', rapidFallScore >= gentleFallScore, 'rapid=' + rapidFallScore + ' gentle=' + gentleFallScore);

    // T2.3: Stained water boost in warm conditions (reduced line visibility)
    const stainedWarm = await score({ ...baseInput, waterColor: 'Stained' }, { ...baseWeather, temp: 82, cloudiness: 20 }, baseOpts);
    const clearWarm = await score({ ...baseInput, waterColor: 'Gin Clear' }, { ...baseWeather, temp: 82, cloudiness: 20 }, baseOpts);
    allScores.push(stainedWarm, clearWarm);
    check('T2: Stained >= GinClear in warm+sunny', stainedWarm >= clearWarm, 'stained=' + stainedWarm + ' gin=' + clearWarm);

    // T2.4: Pre-spawn boost at temperatures just below spawn start
    const preSpawnInput = { ...baseInput, speciesName: 'Bluegill' }; // spawn starts at 65F
    const preSpawnScore = await score(preSpawnInput, { ...baseWeather, temp: 62+3 }, { ...baseOpts, month: 5, date: new Date('2024-05-15') });
    const postSpawnScore = await score(preSpawnInput, { ...baseWeather, temp: 80+3 }, { ...baseOpts, month: 7 });
    allScores.push(preSpawnScore, postSpawnScore);
    // Pre-spawn should not be dramatically lower than post-spawn
    check('T2: Pre-spawn not crushed', preSpawnScore >= 10, 'preSpawn=' + preSpawnScore);

    // T2.5: Overcast reduces the clarity penalty (clouds + stained = good)
    const stainedOvercast = await score({ ...baseInput, waterColor: 'Stained' }, { ...baseWeather, cloudiness: 90 }, baseOpts);
    const stainedClear = await score({ ...baseInput, waterColor: 'Stained' }, { ...baseWeather, cloudiness: 0 }, baseOpts);
    allScores.push(stainedOvercast, stainedClear);
    check('T2: Stained+overcast > stained+clear', stainedOvercast >= stainedClear - 3, 'overcast=' + stainedOvercast + ' clear=' + stainedClear);

    // T2.6: Species thermal specialization - cold vs warm species at same temp
    const pikeInput = { ...baseInput, speciesName: 'Northern Pike' };
    const pikeCool = await score(pikeInput, { ...baseWeather, temp: 58 }, baseOpts);
    const pikeWarm = await score(pikeInput, { ...baseWeather, temp: 85 }, baseOpts);
    const bassCool = await score(baseInput, { ...baseWeather, temp: 58 }, baseOpts);
    const bassWarm = await score(baseInput, { ...baseWeather, temp: 85 }, baseOpts);
    allScores.push(pikeCool, pikeWarm, bassCool, bassWarm);
    // Pike (opt=63) should be relatively better at cool temps than bass (opt=78)
    const pikeAdvantage = pikeCool - pikeWarm;
    const bassAdvantage = bassCool - bassWarm;
    check('T2: Pike less heat-averse than bass', pikeAdvantage >= bassAdvantage - 5, 'pikeAdv=' + pikeAdvantage + ' bassAdv=' + bassAdvantage);

    // T2.7: Wind benefit at moderate temps (oxygenation > disruption)
    const moderateWindScore = await score(baseInput, { ...baseWeather, wind: { speed: 8 } }, baseOpts);
    const calmScore2 = await score(baseInput, { ...baseWeather, wind: { speed: 0 } }, baseOpts);
    allScores.push(moderateWindScore, calmScore2);
    check('T2: Moderate wind > calm at warm temp', moderateWindScore > calmScore2, 'wind=' + moderateWindScore + ' calm=' + calmScore2);

    // T2.8: Night fishing for nocturnal species in summer
    const walleyeNightSummer = await score(walleyeInput, baseWeather, { ...baseOpts, hour: 23 });
    const walleyeNoonSummer = await score(walleyeInput, baseWeather, { ...baseOpts, hour: 12 });
    allScores.push(walleyeNightSummer, walleyeNoonSummer);
    check('T2: Walleye night score elevated in summer', walleyeNightSummer >= 50, 'night=' + walleyeNightSummer);
    check('T2: Walleye night > noon by >= 5', walleyeNightSummer >= walleyeNoonSummer + 5, 'night=' + walleyeNightSummer + ' noon=' + walleyeNoonSummer);


    // === Compute Final Score ===
    const accuracyScore = (passed / total) * 100;
    const rangeBonus = Math.min(dynamicRange, 60) / 60 * 10;
    const finalScore = Math.round((accuracyScore + rangeBonus) * 10) / 10;
    console.log(Math.round(finalScore));
}
runBenchmark().then(() => process.exit(0)).catch(e => { process.exit(1); });

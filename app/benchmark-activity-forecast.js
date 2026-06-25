'use strict';
/**
 * Scientific Accuracy Benchmark for activity-forecast.js
 * Tests temporal forecast invariants across diverse scenarios.
 * Metric: accuracy_score (higher is better, 0-100)
 */

const { deriveActivityForecast } = require('./src/engine/activity-forecast');

let passed = 0;
let total = 0;
const violations = [];
const allScores = [];

function check(name, condition, detail) {
    total++;
    if (condition) {
        passed++;
    } else {
        violations.push(`${name}: ${detail || ''}`);
    }
}

function collectScores(result) {
    result.forEach(v => allScores.push(v));
}

// === 1. Basic Structure ===
const basic = deriveActivityForecast({
    currentHour: 6, pressureTrend: 'Falling', metabolicEfficiency: 0.72
});
check('Returns 12 values', basic.length === 12, `len=${basic.length}`);
check('All values 1-10', basic.every(v => v >= 1 && v <= 10), `vals=${basic.join(',')}`);
check('All values are numbers', basic.every(v => typeof v === 'number' && !isNaN(v)), '');
collectScores(basic);

// === 2. Pressure Monotonicity ===
const trends = ['Rapidly Falling', 'Falling', 'Stable', 'Rising', 'Rapidly Rising'];
const trendSums = {};
for (const t of trends) {
    const r = deriveActivityForecast({ currentHour: 6, pressureTrend: t, metabolicEfficiency: 0.7 });
    trendSums[t] = r.reduce((a, b) => a + b, 0);
    collectScores(r);
}
check('Falling sum > Stable sum', trendSums['Falling'] > trendSums['Stable'], `F=${trendSums['Falling']} S=${trendSums['Stable']}`);
check('Stable sum > Rising sum', trendSums['Stable'] > trendSums['Rising'], `S=${trendSums['Stable']} R=${trendSums['Rising']}`);
check('Rapidly Falling > Rapidly Rising', trendSums['Rapidly Falling'] > trendSums['Rapidly Rising'], `RF=${trendSums['Rapidly Falling']} RR=${trendSums['Rapidly Rising']}`);
check('Falling > Rising', trendSums['Falling'] > trendSums['Rising'], `F=${trendSums['Falling']} R=${trendSums['Rising']}`);

// === 3. Crepuscular Peaks (non-nocturnal, starting from dawn) ===
const dawnForecast = deriveActivityForecast({
    currentHour: 6, pressureTrend: 'Stable', metabolicEfficiency: 0.7
});
collectScores(dawnForecast);
// Hour 0 = dawn (6am), should be elevated
check('Dawn start elevated (>=5)', dawnForecast[0] >= 5, `dawn[0]=${dawnForecast[0]}`);
// Should show dusk peak around hour 12 (6+12=18=6pm)
const duskIdx = 12; // hour 18 = index 12, but array is 12 long so index 11
// Actually index 0=6am, index 11=5pm. Dusk at 18 would be index 12 which is out of range.
// But dusk hour 17-20, so indices 11 (17:00) should be elevated
check('Late afternoon elevated', dawnForecast[11] >= dawnForecast[8], `[11]=${dawnForecast[11]} [8]=${dawnForecast[8]}`);

// === 4. Midday Depression ===
const noonForecast = deriveActivityForecast({
    currentHour: 12, pressureTrend: 'Stable', metabolicEfficiency: 0.7 });
collectScores(noonForecast);
check('Midday start is low (<=5)', noonForecast[0] <= 5, `noon[0]=${noonForecast[0]}`);
// Dawn peak should appear ~5-6 hours later (index 5-6 = hour 17-18)
const noonMax = Math.max(...noonForecast);
const noonMaxIdx = noonForecast.indexOf(noonMax);
check('Peak appears in afternoon/evening (idx 5-11)', noonMaxIdx >= 5, `peakIdx=${noonMaxIdx} max=${noonMax}`);

// === 5. Midnight Wrap ===
const nightForecast = deriveActivityForecast({
    currentHour: 22, pressureTrend: 'Stable', metabolicEfficiency: 0.7 });
collectScores(nightForecast);
// Dawn peak at ~hour 6 = index 8 (22+8=30%24=6)
check('Dawn peak after midnight wrap', nightForecast[8] >= 5 || nightForecast[7] >= 5, `[7]=${nightForecast[7]} [8]=${nightForecast[8]}`);

// === 6. Metabolic Efficiency Impact ===
const highMeta = deriveActivityForecast({ currentHour: 6, pressureTrend: 'Stable', metabolicEfficiency: 0.9 });
const lowMeta = deriveActivityForecast({ currentHour: 6, pressureTrend: 'Stable', metabolicEfficiency: 0.3 });
collectScores(highMeta); collectScores(lowMeta);
const highSum = highMeta.reduce((a, b) => a + b, 0);
const lowSum = lowMeta.reduce((a, b) => a + b, 0);
check('High metabolic > low metabolic', highSum > lowSum, `high=${highSum} low=${lowSum}`);

// === 7. Hourly Data Mode (full formula) ===
function makeHourly(startHour, startPressure, pressureDelta) {
    const hourly = [];
    for (let i = 0; i < 12; i++) {
        hourly.push({
            temp: 75,
            pressure: startPressure + i * pressureDelta,
            wind: { speed: 5 },
            cloudiness: 40,
            hour: (startHour + i) % 24
        });
    }
    return hourly;
}

const fallingHourly = makeHourly(6, 1015, -0.5);
const risingHourly = makeHourly(6, 1010, 0.5);

const fallingResult = deriveActivityForecast({
    currentHour: 6, pressureTrend: 'Falling', metabolicEfficiency: 0.7,
    hourly: fallingHourly, waterTemp: 72, speciesMetrics: { opt: 72, dorm: 45 }
});
const risingResult = deriveActivityForecast({
    currentHour: 6, pressureTrend: 'Rising', metabolicEfficiency: 0.7,
    hourly: risingHourly, waterTemp: 72, speciesMetrics: { opt: 72, dorm: 45 }
});
collectScores(fallingResult); collectScores(risingResult);

check('Hourly: falling > rising (1st half sum)',
    fallingResult.slice(0, 6).reduce((a, b) => a + b, 0) > risingResult.slice(0, 6).reduce((a, b) => a + b, 0),
    `falling=${fallingResult.slice(0,6).join(',')} rising=${risingResult.slice(0,6).join(',')}`);

// === 8. Species-Specific Thermal Response ===
const neutralHourly = makeHourly(6, 1013, 0);
const coldWater = deriveActivityForecast({
    currentHour: 6, pressureTrend: 'Stable', metabolicEfficiency: 0.5,
    hourly: neutralHourly, waterTemp: 56, speciesMetrics: { opt: 55, dorm: 35 }
});
const warmWater = deriveActivityForecast({
    currentHour: 6, pressureTrend: 'Stable', metabolicEfficiency: 0.5,
    hourly: neutralHourly, waterTemp: 56, speciesMetrics: { opt: 76, dorm: 52 }
});
collectScores(coldWater); collectScores(warmWater);
const coldSum = coldWater.reduce((a, b) => a + b, 0);
const warmSum = warmWater.reduce((a, b) => a + b, 0);
check('Cold-water species > warm-water species at cold temp', coldSum > warmSum, `cold=${coldSum} warm=${warmSum}`);

// === 9. Temporal Smoothness ===
// Adjacent hours should not have wild swings
const smoothTest = deriveActivityForecast({
    currentHour: 6, pressureTrend: 'Stable', metabolicEfficiency: 0.7,
    hourly: makeHourly(6, 1013, 0), waterTemp: 70, speciesMetrics: { opt: 70, dorm: 45 }
});
collectScores(smoothTest);
let maxJump = 0;
for (let i = 1; i < smoothTest.length; i++) {
    maxJump = Math.max(maxJump, Math.abs(smoothTest[i] - smoothTest[i - 1]));
}
check('Smooth transitions (max jump <= 3.0)', maxJump <= 3.0, `maxJump=${maxJump.toFixed(1)}`);
check('Very smooth transitions (max jump <= 2.0)', maxJump <= 2.0, `maxJump=${maxJump.toFixed(1)}`);

// === 10. Pressure History Seeding ===
const baseHourly = makeHourly(12, 1005, 0);
const withHistory = deriveActivityForecast({
    currentHour: 12, pressureTrend: 'Stable', metabolicEfficiency: 0.7,
    hourly: baseHourly, waterTemp: 58, speciesMetrics: { opt: 70, dorm: 45 },
    pressureHistory: [{ pressure: 1010, timestamp: Date.now() - 3600000 }]
});
const withoutHistory = deriveActivityForecast({
    currentHour: 12, pressureTrend: 'Stable', metabolicEfficiency: 0.7,
    hourly: baseHourly, waterTemp: 58, speciesMetrics: { opt: 70, dorm: 45 },
    pressureHistory: []
});
collectScores(withHistory); collectScores(withoutHistory);
check('History-seeded hour 0 > no-history hour 0', withHistory[0] > withoutHistory[0], `hist=${withHistory[0]} nohist=${withoutHistory[0]}`);

// === 11. Nocturnal Species in Forecast ===
const nocturnalHourly = makeHourly(20, 1013, 0);
const nocturnalForecast = deriveActivityForecast({
    currentHour: 20, pressureTrend: 'Stable', metabolicEfficiency: 0.7,
    hourly: nocturnalHourly, waterTemp: 65, speciesMetrics: { opt: 65, dorm: 40, nocturnal: true }
});
collectScores(nocturnalForecast);
// Starting at 8pm, nocturnal species should have elevated night scores
check('Nocturnal elevated at night start (>=5)', nocturnalForecast[0] >= 5, `nocturnal[0]=${nocturnalForecast[0]}`);

// === 12. Dynamic Range ===
const minScore = Math.min(...allScores);
const maxScore = Math.max(...allScores);
const dynamicRange = maxScore - minScore;
check('Dynamic range >= 4 points', dynamicRange >= 4, `range=${dynamicRange.toFixed(1)} (${minScore}-${maxScore})`);
check('Dynamic range >= 6 points', dynamicRange >= 6, `range=${dynamicRange.toFixed(1)} (${minScore}-${maxScore})`);

// === 13. Monotonic Trend Ordering ===
// Verify strict ordering: RF >= F >= S >= R >= RR
check('RF >= F', trendSums['Rapidly Falling'] >= trendSums['Falling'] - 1, `RF=${trendSums['Rapidly Falling']} F=${trendSums['Falling']}`);
check('F >= S', trendSums['Falling'] >= trendSums['Stable'] - 1, `F=${trendSums['Falling']} S=${trendSums['Stable']}`);
check('S >= R', trendSums['Stable'] >= trendSums['Rising'] - 1, `S=${trendSums['Stable']} R=${trendSums['Rising']}`);
check('R >= RR', trendSums['Rising'] >= trendSums['Rapidly Rising'] - 1, `R=${trendSums['Rising']} RR=${trendSums['Rapidly Rising']}`);

// === 14. Anchor Score Alignment ===
const anchored = deriveActivityForecast({
    currentHour: 6, pressureTrend: 'Stable', metabolicEfficiency: 0.7,
    hourly: makeHourly(6, 1013, 0), waterTemp: 70, speciesMetrics: { opt: 70, dorm: 45 },
    anchorScore: 70
});
collectScores(anchored);
// Anchored hour 0 should be close to 70/10 = 7.0
check('Anchor pulls hour 0 near anchor (±2.0)', Math.abs(anchored[0] - 7.0) <= 2.0, `anchored[0]=${anchored[0]} expected~7.0`);

// === Compute Final Score ===
const accuracyScore = (passed / total) * 100;
const rangeBonus = Math.min(dynamicRange, 8) / 8 * 10;
const finalScore = Math.round((accuracyScore + rangeBonus) * 10) / 10;

if (violations.length > 0) {
}
console.log(Math.round(finalScore));

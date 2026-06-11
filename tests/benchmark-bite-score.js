'use strict';

const { createBiteScoreEngine } = require('../src/engine/bite-score');
const { createLureScorer } = require('../src/engine/lure-scorer');
const { clearPressureCache } = require('../src/engine/pressure-trend');

const ITERATIONS = 5000;

// Mock data similar to fishingData.json
const mockFishingData = {
    species_data: [
        { name: 'Largemouth Bass', scientific_metrics: { opt: 72, dorm: 45, sensitivity: 'Medium' } },
        { name: 'Smallmouth Bass', scientific_metrics: { opt: 68, dorm: 42, sensitivity: 'Medium' } },
        { name: 'Walleye', scientific_metrics: { opt: 65, dorm: 40, sensitivity: 'High' } },
        { name: 'Northern Pike', scientific_metrics: { opt: 60, dorm: 38, sensitivity: 'Low' } },
        { name: 'Trout', scientific_metrics: { opt: 55, dorm: 35, sensitivity: 'High' } }
    ]
};

// Mock lure catalog
const mockLures = [
    { name: 'Crankbait Red', category: 'Crankbait', primary_species: ['Largemouth Bass'], best_conditions: { water_clarity: { Clear: 0.9, Stained: 1.0, Muddy: 0.7 } } },
    { name: 'Jig Black', category: 'Jig', primary_species: ['Smallmouth Bass', 'Largemouth Bass'], best_conditions: { water_clarity: { Clear: 1.0, Stained: 0.9, Muddy: 0.8 } } },
    { name: 'Spinnerbait Gold', category: 'Spinnerbait', primary_species: ['Northern Pike', 'Walleye'], best_conditions: { water_clarity: { Clear: 0.8, Stained: 1.0, Muddy: 0.9 } } },
    { name: 'Soft Plastic Worm', category: 'Soft Plastic', primary_species: ['Largemouth Bass'], best_conditions: { water_clarity: { Clear: 0.9, Stained: 0.9, Muddy: 0.9 } } },
    { name: 'Topwater Popper', category: 'Topwater', primary_species: ['Largemouth Bass', 'Smallmouth Bass'], best_conditions: { water_clarity: { Clear: 1.0, Stained: 0.8, Muddy: 0.6 } } }
];

async function mockWaterTempProvider(_lat, _lon, airTempF) {
    return {
        waterTempF: airTempF,
        waterTempC: (airTempF - 32) * 5 / 9,
        source: 'benchmark-fixture',
        stationName: null,
        stationDistance: null
    };
}

const lureScorer = createLureScorer({ lure_catalog: mockLures });
const biteEngine = createBiteScoreEngine(
    mockFishingData,
    lureScorer,
    { waterTempProvider: mockWaterTempProvider }
);

// Mock weather scenarios
const weatherScenarios = [
    { temp: 75, pressure: 1013, wind: { speed: 8 }, cloudiness: 40, pressureHistory: [{ pressure: 1015, timestamp: Date.now() - 7200000 }, { pressure: 1013, timestamp: Date.now() }] },
    { temp: 45, pressure: 1020, wind: { speed: 15 }, cloudiness: 80, pressureHistory: [{ pressure: 1018, timestamp: Date.now() - 7200000 }, { pressure: 1020, timestamp: Date.now() }] },
    { temp: 60, pressure: 1008, wind: { speed: 5 }, cloudiness: 20, pressureHistory: [{ pressure: 1012, timestamp: Date.now() - 7200000 }, { pressure: 1008, timestamp: Date.now() }] },
    { temp: 85, pressure: 1015, wind: { speed: 12 }, cloudiness: 60, pressureHistory: [{ pressure: 1015, timestamp: Date.now() - 7200000 }, { pressure: 1015, timestamp: Date.now() }] }
];

async function benchmark() {
    clearPressureCache();
    
    const start = performance.now();
    
    for (let i = 0; i < ITERATIONS; i++) {
        const species = mockFishingData.species_data[i % 5].name;
        const weather = weatherScenarios[i % 4];
        const waterColor = ['Clear', 'Stained', 'Muddy'][i % 3];
        const hour = 6 + (i % 16); // Hours 6-21
        
        // Full scientific strategy calculation
        await biteEngine.calculateScientificStrategy(
            { speciesName: species, waterColor: waterColor, location: `lake${i % 10}` },
            weather,
            { useLureCatalog: true, month: 6, hour: hour }
        );
        
        // Occasionally do quick bite
        if (i % 5 === 0) {
            await biteEngine.calculateQuickBite(weather);
        }
    }
    
    const end = performance.now();
    const totalTime = (end - start) / 1000; // seconds
    
    console.log(`Total time: ${totalTime.toFixed(4)}s`);
    console.log(`Average per iteration: ${(totalTime * 1000 / ITERATIONS).toFixed(6)}ms`);
}

benchmark().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

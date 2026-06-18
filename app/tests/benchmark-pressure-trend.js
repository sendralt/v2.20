'use strict';

const { recordPressure, getPressureTrend, clearPressureCache, computeTrendFromHistory } = require('../src/engine/pressure-trend');

const ITERATIONS = 10000;

function benchmark() {
    clearPressureCache();
    
    const start = performance.now();
    
    for (let i = 0; i < ITERATIONS; i++) {
        const loc = `loc${i % 100}`;
        const now = Date.now();
        
        // Simulate recording pressure readings
        recordPressure(loc, 1013 + (i % 10), now - 3600000);
        recordPressure(loc, 1015 + (i % 10), now);
        
        // Get pressure trend
        const trend = getPressureTrend(loc);
        
        // Compute from history occasionally
        if (i % 10 === 0) {
            computeTrendFromHistory([
                { pressure: 1013, timestamp: now - 7200000 },
                { pressure: 1015, timestamp: now - 3600000 },
                { pressure: 1018, timestamp: now }
            ]);
        }
    }
    
    const end = performance.now();
    const totalTime = (end - start) / 1000; // seconds
    
    console.log(`Total time: ${totalTime.toFixed(4)}s`);
    console.log(`Average per iteration: ${(totalTime * 1000 / ITERATIONS).toFixed(6)}ms`);
}

benchmark();

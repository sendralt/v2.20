"use strict";
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { recordPressure, getPressureTrend, clearPressureCache, computeTrendFromHistory, classifyTrend } = require('../src/engine/pressure-trend');

describe('Pressure Trend Detection', () => {
    beforeEach(() => { clearPressureCache(); });

    it('no data returns Unknown', () => {
        const r = getPressureTrend('noexist');
        assert.equal(r.classification, 'Unknown');
    });

    it('single reading returns Unknown', () => {
        recordPressure('loc1', 1013);
        const r = getPressureTrend('loc1');
        assert.equal(r.classification, 'Unknown');
        assert.equal(r.hpaPerHour, null);
        assert.ok(r.label.includes('insufficient'));
    });

    it('same pressure twice returns Stable', () => {
        const now = Date.now();
        recordPressure('loc2', 1013, now - 3600000);
        recordPressure('loc2', 1013, now);
        const r = getPressureTrend('loc2');
        assert.equal(r.classification, 'Stable');
        assert.ok(r.label.includes('normal patterns'));
    });

    it('falling pressure returns Falling', () => {
        const now = Date.now();
        recordPressure('loc3', 1013.5, now - 3600000);
        recordPressure('loc3', 1013, now);
        const r = getPressureTrend('loc3');
        assert.equal(r.classification, 'Falling');
        assert.ok(r.hpaPerHour > -1.0 && r.hpaPerHour <= -0.3, 'Got rate: ' + r.hpaPerHour);
    });

    it('rapidly falling returns Rapidly Falling', () => {
        const now = Date.now();
        recordPressure('loc4', 1018, now - 3600000);
        recordPressure('loc4', 1015, now);
        const r = getPressureTrend('loc4');
        assert.equal(r.classification, 'Rapidly Falling');
        assert.ok(r.hpaPerHour <= -1.0);
    });

    it('rising pressure returns Rising', () => {
        const now = Date.now();
        recordPressure('loc5', 1013, now - 3600000);
        recordPressure('loc5', 1013.5, now);
        const r = getPressureTrend('loc5');
        assert.equal(r.classification, 'Rising');
        assert.ok(r.hpaPerHour > 0.3 && r.hpaPerHour < 1.0);
    });

    it('rapidly rising returns Rapidly Rising', () => {
        const now = Date.now();
        recordPressure('loc6', 1013, now - 3600000);
        recordPressure('loc6', 1016, now);
        const r = getPressureTrend('loc6');
        assert.equal(r.classification, 'Rapidly Rising');
        assert.ok(r.hpaPerHour >= 1.0);
    });

    it('readings too close together returns Unknown', () => {
        const now = Date.now();
        recordPressure('loc7', 1013, now - 600000);
        recordPressure('loc7', 1015, now);
        const r = getPressureTrend('loc7');
        assert.equal(r.classification, 'Unknown');
        assert.ok(r.label.includes('too close'));
    });

    it('cache prunes expired entries beyond TTL', () => {
        const now = Date.now();
        recordPressure('loc8', 1013, now - 4 * 3600000);
        recordPressure('loc8', 1015, now);
        const r = getPressureTrend('loc8');
        assert.equal(r.classification, 'Unknown');
    });

    it('locations are isolated', () => {
        const now = Date.now();
        recordPressure('locA', 1015, now - 3600000);
        recordPressure('locA', 1013, now);
        assert.equal(getPressureTrend('locB').classification, 'Unknown');
    });

    it('hpaPerHour correctly calculated over 2 hours', () => {
        const now = Date.now();
        recordPressure('loc9', 1010, now - 7200000);
        recordPressure('loc9', 1014, now);
        const r = getPressureTrend('loc9');
        assert.equal(r.hpaPerHour, 2.0);
        assert.equal(r.classification, 'Rapidly Rising');
    });
});

describe('computeTrendFromHistory', () => {
    it('empty array returns Unknown', () => {
        const result = computeTrendFromHistory([]);
        assert.equal(result.classification, 'Unknown');
        assert.equal(result.hpaPerHour, null);
        assert.ok(result.label.includes('insufficient historical data'));
    });

    it('non-array returns Unknown', () => {
        const result = computeTrendFromHistory(null);
        assert.equal(result.classification, 'Unknown');
    });

    it('single reading returns Unknown', () => {
        const result = computeTrendFromHistory([{ pressure: 1013, timestamp: Date.now() }]);
        assert.equal(result.classification, 'Unknown');
        assert.equal(result.hpaPerHour, null);
    });

    it('two readings showing falling returns Falling', () => {
        const now = Date.now();
        const readings = [
            { pressure: 1014, timestamp: now - 3600000 },
            { pressure: 1013.5, timestamp: now }
        ];
        const result = computeTrendFromHistory(readings);
        assert.equal(result.classification, 'Falling');
        assert.ok(result.hpaPerHour > -1.0 && result.hpaPerHour <= -0.3, 'Got rate: ' + result.hpaPerHour);
    });

    it('three readings showing rapidly falling returns Rapidly Falling', () => {
        const now = Date.now();
        const readings = [
            { pressure: 1020, timestamp: now - 7200000 },
            { pressure: 1016, timestamp: now - 3600000 },
            { pressure: 1012, timestamp: now }
        ];
        const result = computeTrendFromHistory(readings);
        assert.equal(result.classification, 'Rapidly Falling');
        assert.ok(result.hpaPerHour <= -1.0);
    });

    it('two readings too close together (< 0.5hr) returns Unknown', () => {
        const now = Date.now();
        const readings = [
            { pressure: 1013, timestamp: now - 600000 },
            { pressure: 1015, timestamp: now }
        ];
        const result = computeTrendFromHistory(readings);
        assert.equal(result.classification, 'Unknown');
        assert.ok(result.label.includes('too close together'));
    });

    it('filters out null pressure values', () => {
        const now = Date.now();
        const readings = [
            { pressure: null, timestamp: now - 3600000 },
            { pressure: 1014, timestamp: now - 1800000 },
            { pressure: 1013.5, timestamp: now }
        ];
        const result = computeTrendFromHistory(readings);
        assert.equal(result.classification, 'Rapidly Falling');
    });

    it('all null pressures returns Unknown', () => {
        const now = Date.now();
        const readings = [
            { pressure: null, timestamp: now - 3600000 },
            { pressure: null, timestamp: now }
        ];
        const result = computeTrendFromHistory(readings);
        assert.equal(result.classification, 'Unknown');
    });

    it('unsorted input is handled correctly', () => {
        const now = Date.now();
        const readings = [
            { pressure: 1012.7, timestamp: now },
            { pressure: 1012, timestamp: now - 3600000 }
        ];
        const result = computeTrendFromHistory(readings);
        assert.equal(result.classification, 'Rising');
    });
});

describe('classifyTrend', () => {
    it('classifies Rapidly Falling for <= -1.0', () => {
        const result = classifyTrend(-1.5);
        assert.equal(result.classification, 'Rapidly Falling');
        assert.ok(result.hpaPerHour === -1.5);
    });

    it('classifies Falling for <= -0.3 and > -1.0', () => {
        const result = classifyTrend(-0.5);
        assert.equal(result.classification, 'Falling');
    });

    it('classifies Stable for between -0.3 and 0.3', () => {
        const result = classifyTrend(0.0);
        assert.equal(result.classification, 'Stable');
    });

    it('classifies Rising for >= 0.3 and < 1.0', () => {
        const result = classifyTrend(0.7);
        assert.equal(result.classification, 'Rising');
    });

    it('classifies Rapidly Rising for >= 1.0', () => {
        const result = classifyTrend(1.2);
        assert.equal(result.classification, 'Rapidly Rising');
    });

    it('rounds hpaPerHour to 2 decimal places', () => {
        const result = classifyTrend(0.33333);
        assert.equal(result.hpaPerHour, 0.33);
    });

    it('boundary -1.0 is Rapidly Falling', () => {
        const result = classifyTrend(-1.0);
        assert.equal(result.classification, 'Rapidly Falling');
    });

    it('boundary -0.3 is Falling (<= threshold)', () => {
        const result = classifyTrend(-0.3);
        assert.equal(result.classification, 'Falling');
    });

    it('boundary 0.3 is Stable', () => {
        const result = classifyTrend(0.3);
        assert.equal(result.classification, 'Stable');
    });

    it('boundary 1.0 is Rapidly Rising', () => {
        const result = classifyTrend(1.0);
        assert.equal(result.classification, 'Rapidly Rising');
    });
});

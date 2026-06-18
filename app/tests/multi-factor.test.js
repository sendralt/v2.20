"use strict";
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { getWindMultiplier, getCloudMultiplier, getTimeMultiplier, getClarityMultiplier } = require('../src/engine/bite-score');

describe('Wind Multiplier', () => {
    it('dead calm (0) -> 0.85', () => assert.equal(getWindMultiplier(0), 0.85));
    it('boundary 1 -> 0.85', () => assert.equal(getWindMultiplier(1), 0.85));
    it('light breeze (5) -> 1.15', () => assert.equal(getWindMultiplier(5), 1.15));
    it('boundary 8 -> 1.15', () => assert.equal(getWindMultiplier(8), 1.15));
    it('moderate (12) -> 1.05', () => assert.equal(getWindMultiplier(12), 1.05));
    it('boundary 15 -> 1.05', () => assert.equal(getWindMultiplier(15), 1.05));
    it('strong (18) -> 0.90', () => assert.equal(getWindMultiplier(18), 0.90));
    it('boundary 20 -> 0.90', () => assert.equal(getWindMultiplier(20), 0.90));
    it('very strong (25) -> 0.75', () => assert.equal(getWindMultiplier(25), 0.75));
    it('null -> 1.0 default', () => assert.equal(getWindMultiplier(null), 1.0));
    it('undefined -> 1.0 default', () => assert.equal(getWindMultiplier(undefined), 1.0));
});

describe('Cloud Cover Multiplier', () => {
    it('clear sky (0) -> 0.85', () => assert.equal(getCloudMultiplier(0), 0.85));
    it('boundary 20 -> 0.85', () => assert.equal(getCloudMultiplier(20), 0.85));
    it('partly cloudy (35) -> 0.95', () => assert.equal(getCloudMultiplier(35), 0.95));
    it('boundary 50 -> 0.95', () => assert.equal(getCloudMultiplier(50), 0.95));
    it('scattered (65) -> 1.10', () => assert.equal(getCloudMultiplier(65), 1.10));
    it('boundary 80 -> 1.10', () => assert.equal(getCloudMultiplier(80), 1.10));
    it('overcast (90) -> 1.15', () => assert.equal(getCloudMultiplier(90), 1.15));
    it('null -> 1.0 default', () => assert.equal(getCloudMultiplier(null), 1.0));
});

describe('Time of Day Multiplier', () => {
    it('dawn (6) -> 1.20 crepuscular', () => assert.equal(getTimeMultiplier(6), 1.20));
    it('dusk (18) -> 1.20 crepuscular', () => assert.equal(getTimeMultiplier(18), 1.20));
    it('boundary 5am -> 1.20', () => assert.equal(getTimeMultiplier(5), 1.20));
    it('boundary 8am -> 1.20', () => assert.equal(getTimeMultiplier(8), 1.20));
    it('boundary 17 -> 1.20', () => assert.equal(getTimeMultiplier(17), 1.20));
    it('boundary 20 -> 1.20', () => assert.equal(getTimeMultiplier(20), 1.20));
    it('mid-morning (10) -> 1.00', () => assert.equal(getTimeMultiplier(10), 1.00));
    it('mid-afternoon (15) -> 1.00', () => assert.equal(getTimeMultiplier(15), 1.00));
    it('midday (12) -> 0.85', () => assert.equal(getTimeMultiplier(12), 0.85));
    it('early pm (13) -> 0.85', () => assert.equal(getTimeMultiplier(13), 0.85));
    it('night (22) -> 0.85', () => assert.equal(getTimeMultiplier(22), 0.85));
    it('late night (3) -> 0.85', () => assert.equal(getTimeMultiplier(3), 0.85));
    it('null -> 1.0 default', () => assert.equal(getTimeMultiplier(null), 1.0));
});

describe('Water Clarity Multiplier', () => {
    it('Gin Clear -> 0.90', () => assert.equal(getClarityMultiplier('Gin Clear'), 0.90));
    it('Clear -> 1.00', () => assert.equal(getClarityMultiplier('Clear'), 1.00));
    it('Stained -> 1.10', () => assert.equal(getClarityMultiplier('Stained'), 1.10));
    it('Muddy -> 0.85', () => assert.equal(getClarityMultiplier('Muddy'), 0.85));
    it('unknown string -> 1.00', () => assert.equal(getClarityMultiplier('Murky'), 1.00));
    it('null -> 1.00', () => assert.equal(getClarityMultiplier(null), 1.00));
});

describe('Adjustment Factor (4th root dampening)', () => {
    it('all neutral (1.0) -> factor = 1.0', () => {
        assert.equal(Math.pow(1*1*1*1, 0.25), 1.0);
    });
    it('all favorable -> boost ~10-15%', () => {
        const adj = Math.pow(1.15 * 1.15 * 1.20 * 1.10, 0.25);
        assert.ok(adj > 1.10 && adj < 1.20, 'Got: ' + adj);
    });
    it('all unfavorable -> reduction ~15%', () => {
        const adj = Math.pow(0.85 * 0.85 * 0.85 * 0.85, 0.25);
        assert.ok(adj < 0.90, 'Got: ' + adj);
    });
});

"use strict";
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { getSpawningMultiplier } = require('../src/engine/spawning');

/**
 * Spawning Cycle Model Tests
 *
 * Fish behavior changes dramatically across spawning phases:
 * - Pre-spawn: Aggressive feeding to build energy reserves (1.2x)
 * - Active spawn: Fish on nests, minimal feeding (0.4x)
 * - Post-spawn: Recovery period, reduced feeding (0.7x)
 * - Outside spawn season: Normal behavior (1.0x)
 *
 * [Source: Carlander 1977 — Handbook of Freshwater Fishery Biology;
 *         Scott & Crossman 1973 — Freshwater Fishes of Canada]
 */

const mockFishingData = {
    species_data: [
        {
            name: 'Largemouth Bass',
            scientific_metrics: {
                spawn_temp_start: 65,
                spawn_temp_peak: 68,
                spawn_temp_end: 72
            }
        },
        {
            name: 'Walleye',
            scientific_metrics: {
                spawn_temp_start: 44,
                spawn_temp_peak: 48,
                spawn_temp_end: 52
            }
        },
        {
            name: 'Catfish',
            scientific_metrics: {
                spawn_temp_start: 70,
                spawn_temp_peak: 75,
                spawn_temp_end: 80
            }
        }
    ]
};

describe('Spawning Cycle Model', () => {

    describe('Largemouth Bass spawning phases', () => {
        it('bass at 65F (pre-spawn) -> 1.2', () => {
            const mult = getSpawningMultiplier(65, 'Largemouth Bass', mockFishingData);
            assert.equal(mult, 1.2);
        });

        it('bass at 68F (active spawn) -> 0.4', () => {
            const mult = getSpawningMultiplier(68, 'Largemouth Bass', mockFishingData);
            assert.equal(mult, 0.4);
        });

        it('bass at 75F (post-spawn) -> 0.7', () => {
            const mult = getSpawningMultiplier(75, 'Largemouth Bass', mockFishingData);
            assert.equal(mult, 0.7);
        });

        it('bass at 50F (outside spawn) -> 1.0', () => {
            const mult = getSpawningMultiplier(50, 'Largemouth Bass', mockFishingData);
            assert.equal(mult, 1.0);
        });

        it('bass at 82F (well past spawn) -> 1.0', () => {
            const mult = getSpawningMultiplier(82, 'Largemouth Bass', mockFishingData);
            assert.equal(mult, 1.0);
        });
    });

    describe('Spawning phase boundaries', () => {
        it('temp exactly at spawn_temp_start -> pre-spawn (1.2)', () => {
            // 65F = spawn_temp_start, boundary should be pre-spawn
            const mult = getSpawningMultiplier(65, 'Largemouth Bass', mockFishingData);
            assert.equal(mult, 1.2);
        });

        it('temp just above spawn_temp_start -> spawning (0.4)', () => {
            // 66F = just into spawning range
            const mult = getSpawningMultiplier(66, 'Largemouth Bass', mockFishingData);
            assert.equal(mult, 0.4);
        });

        it('temp exactly at spawn_temp_end -> spawning (0.4)', () => {
            // 72F = spawn_temp_end
            const mult = getSpawningMultiplier(72, 'Largemouth Bass', mockFishingData);
            assert.equal(mult, 0.4);
        });

        it('temp just above spawn_temp_end -> post-spawn (0.7)', () => {
            // 73F = just into post-spawn
            const mult = getSpawningMultiplier(73, 'Largemouth Bass', mockFishingData);
            assert.equal(mult, 0.7);
        });

        it('temp at spawn_temp_end + 5 -> post-spawn (0.7)', () => {
            // 77F = spawn_temp_end (72) + 5 = boundary of post-spawn
            const mult = getSpawningMultiplier(77, 'Largemouth Bass', mockFishingData);
            assert.equal(mult, 0.7);
        });

        it('temp above spawn_temp_end + 5 -> outside (1.0)', () => {
            // 78F = beyond post-spawn window
            const mult = getSpawningMultiplier(78, 'Largemouth Bass', mockFishingData);
            assert.equal(mult, 1.0);
        });
    });

    describe('Other species', () => {
        it('walleye at 48F (peak spawn) -> 0.4', () => {
            const mult = getSpawningMultiplier(48, 'Walleye', mockFishingData);
            assert.equal(mult, 0.4);
        });

        it('walleye at 40F (pre-spawn) -> 1.2', () => {
            const mult = getSpawningMultiplier(40, 'Walleye', mockFishingData);
            assert.equal(mult, 1.2);
        });

        it('catfish at 75F (peak spawn) -> 0.4', () => {
            const mult = getSpawningMultiplier(75, 'Catfish', mockFishingData);
            assert.equal(mult, 0.4);
        });
    });

    describe('Edge cases', () => {
        it('unknown species -> 1.0 (safe default)', () => {
            const mult = getSpawningMultiplier(68, 'Unknown Fish', mockFishingData);
            assert.equal(mult, 1.0);
        });

        it('null fishingData -> 1.0 (safe default)', () => {
            const mult = getSpawningMultiplier(68, 'Largemouth Bass', null);
            assert.equal(mult, 1.0);
        });

        it('species with missing spawn temps -> 1.0 (safe default)', () => {
            const noSpawnData = {
                species_data: [{
                    name: 'Test Fish',
                    scientific_metrics: { opt: 65 }
                }]
            };
            const mult = getSpawningMultiplier(68, 'Test Fish', noSpawnData);
            assert.equal(mult, 1.0);
        });
    });
});

"use strict";
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const data = require('../data/lures.json');

/**
 * Validation tests for expanded lure catalog (Task 15).
 * Ensures catalog has 35+ entries, required categories, and complete field coverage.
 */

const REQUIRED_FIELDS = [
    'category',
    'species',
    'best_conditions',
    'depth',
    'presentation'
];

const BEST_CONDITION_FIELDS = [
    'water_clarity',
    'seasons',
    'temperature_band'
];

describe('Lure Catalog Validation', () => {
    it('has at least 35 lures', () => {
        assert.ok(data.lure_catalog.length >= 35,
            `Expected >= 35 lures, got ${data.lure_catalog.length}`);
    });

    data.lure_catalog.forEach((lure) => {
        describe(`Lure: ${lure.name}`, () => {
            it('has all required top-level fields', () => {
                const missing = REQUIRED_FIELDS.filter(f => !(f in lure));
                assert.deepEqual(missing, [],
                    `${lure.name} missing: ${missing.join(', ')}`);
            });

            it('species is a non-empty array', () => {
                assert.ok(Array.isArray(lure.species) && lure.species.length > 0,
                    `${lure.name} species must be a non-empty array`);
            });

            it('has water_clarity in best_conditions', () => {
                const wc = lure.best_conditions?.water_clarity;
                assert.ok(wc && typeof wc === 'object',
                    `${lure.name} missing best_conditions.water_clarity`);
            });

            it('has seasons in best_conditions', () => {
                const seasons = lure.best_conditions?.seasons;
                assert.ok(Array.isArray(seasons) && seasons.length > 0,
                    `${lure.name} missing best_conditions.seasons`);
            });

            it('has temperature_band in best_conditions', () => {
                const tb = lure.best_conditions?.temperature_band;
                assert.ok(typeof tb === 'string' && tb.length > 0,
                    `${lure.name} missing best_conditions.temperature_band`);
            });

            it('has depth string', () => {
                assert.ok(typeof lure.depth === 'string' && lure.depth.length > 0,
                    `${lure.name} missing depth`);
            });

            it('has presentation object', () => {
                assert.ok(lure.presentation && typeof lure.presentation === 'object',
                    `${lure.name} missing presentation`);
            });
        });
    });

    it('includes at least 5 new categories beyond original 7', () => {
        const originalCategories = ['Crankbait', 'Soft Plastic', 'Jig', 'Spinnerbait', 'Spoon', 'Rig', 'Topwater'];
        const allCategories = new Set(data.lure_catalog.map(l => l.category));
        const newCategories = [...allCategories].filter(c => !originalCategories.includes(c));
        assert.ok(newCategories.length >= 5,
            `Expected >= 5 new categories, got ${newCategories.length}: ${newCategories.join(', ')}`);
    });

    it('includes at least 3 cold-water/finesse lures for trout/salmon/steelhead', () => {
        const coldSpecies = ['Trout', 'Brown Trout', 'Rainbow Trout', 'Brook Trout', 'Steelhead', 'Salmon'];
        const coldLures = data.lure_catalog.filter(lure =>
            lure.species.some(s => coldSpecies.includes(s)) &&
            lure.best_conditions?.temperature_band?.toLowerCase().includes('cold')
        );
        assert.ok(coldLures.length >= 3,
            `Expected >= 3 cold-water lures for trout/salmon/steelhead, got ${coldLures.length}`);
    });

    it('major species have at least 2 lures each', () => {
        const majorSpecies = ['Largemouth Bass', 'Smallmouth Bass', 'Walleye', 'Crappie', 'Bluegill',
            'Northern Pike', 'Yellow Perch', 'Striped Bass', 'Catfish', 'Trout', 'Salmon', 'Steelhead'];
        majorSpecies.forEach(sp => {
            const count = data.lure_catalog.filter(l => l.species.includes(sp)).length;
            assert.ok(count >= 2,
                `${sp} has only ${count} lure(s), need >= 2`);
        });
    });
});

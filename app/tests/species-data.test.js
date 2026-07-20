"use strict";
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const data = require('../data/fishingData.json');

/**
 * Validation tests for expanded species data schema (Task 14).
 * Ensures every species has all required scientific fields with cited values.
 */

const REQUIRED_FIELDS = [
    'opt',
    'dorm',
    'sensitivity',
    'feeding_cease_temp',
    'nocturnal',
    'spawn_temp_start',
    'spawn_temp_peak',
    'spawn_temp_end',
    'do_tolerance',
    'preferred_depth',
    'forage_base',
    'turbidity_preference'
];

describe('Species Data Schema Validation', () => {
    it('has at least 25 species (20 existing + 5 new)', () => {
        assert.ok(data.species_data.length >= 25,
            `Expected >= 25 species, got ${data.species_data.length}`);
    });

    data.species_data.forEach((species) => {
        describe(`Species: ${species.name}`, () => {
            it('has all required fields', () => {
                const missing = REQUIRED_FIELDS.filter(
                    f => !(f in species.scientific_metrics)
                );
                assert.deepEqual(missing, [],
                    `${species.name} missing fields: ${missing.join(', ')}`);
            });

            it('opt is a reasonable feeding temperature (40-85°F)', () => {
                const opt = species.scientific_metrics.opt;
                assert.ok(typeof opt === 'number',
                    `${species.name} opt must be a number`);
                assert.ok(opt >= 40 && opt <= 85,
                    `${species.name} opt=${opt} out of range [40, 85]`);
            });

            it('feeding_cease_temp > opt', () => {
                const { opt, feeding_cease_temp } = species.scientific_metrics;
                assert.ok(feeding_cease_temp > opt,
                    `${species.name} feeding_cease_temp (${feeding_cease_temp}) must exceed opt (${opt})`);
            });

            it('nocturnal is a boolean', () => {
                assert.equal(typeof species.scientific_metrics.nocturnal, 'boolean');
            });

            it('spawn temperatures form valid range (start <= peak <= end)', () => {
                const m = species.scientific_metrics;
                assert.ok(m.spawn_temp_start <= m.spawn_temp_peak,
                    `${species.name} spawn_start > spawn_peak`);
                assert.ok(m.spawn_temp_peak <= m.spawn_temp_end,
                    `${species.name} spawn_peak > spawn_end`);
            });

            it('do_tolerance is a number (0-10 scale)', () => {
                const doTol = species.scientific_metrics.do_tolerance;
                assert.ok(typeof doTol === 'number',
                    `${species.name} do_tolerance must be a number`);
                assert.ok(doTol >= 0 && doTol <= 10,
                    `${species.name} do_tolerance=${doTol} out of range [0, 10]`);
            });

            it('preferred_depth is a number >= 0', () => {
                const depth = species.scientific_metrics.preferred_depth;
                assert.ok(typeof depth === 'number',
                    `${species.name} preferred_depth must be a number`);
                assert.ok(depth >= 0,
                    `${species.name} preferred_depth=${depth} must be >= 0`);
            });

            it('forage_base is a non-empty array', () => {
                const forage = species.scientific_metrics.forage_base;
                assert.ok(Array.isArray(forage) && forage.length > 0,
                    `${species.name} forage_base must be a non-empty array`);
            });

            it('turbidity_preference is a valid string', () => {
                const validPrefs = ['Clear', 'Stained', 'Muddy', 'Clear to Stained', 'Stained to Muddy', 'Any'];
                const pref = species.scientific_metrics.turbidity_preference;
                assert.ok(typeof pref === 'string' && pref.length > 0,
                    `${species.name} turbidity_preference must be a non-empty string`);
                assert.ok(validPrefs.includes(pref),
                    `${species.name} turbidity_preference='${pref}' not in ${validPrefs.join(', ')}`);
            });
        });
    });

    it('includes 5 new species: carp, gar, bowfin, sturgeon, redear sunfish', () => {
        const names = data.species_data.map(s => s.name.toLowerCase());
        ['carp', 'gar', 'bowfin', 'sturgeon', 'redear sunfish'].forEach(s => {
            assert.ok(names.some(n => n.includes(s)),
                `Missing new species: ${s}`);
        });
    });
});

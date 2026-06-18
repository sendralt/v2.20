"use strict";
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createLureScorer } = require('../src/engine/lure-scorer');

const mockLureData = {
    lure_catalog: [
        {
            name: 'Reaction Crankbait', category: 'Crankbait',
            primary_species: ['Largemouth Bass'],
            best_conditions: { water_clarity: { Clear: 0.9, Muddy: 0.3 } },
            target_cover: ['Submerged weeds'],
            presentation: { retrieve: 'Fast burn' }
        },
        {
            name: 'Finesse Jig', category: 'Jig',
            primary_species: ['Largemouth Bass'],
            best_conditions: { water_clarity: { Clear: 0.8, Muddy: 0.7 } },
            target_cover: ['Rock pile'],
            presentation: { retrieve: 'Slow drag' }
        },
        {
            name: 'Walleye Spinner', category: 'Spinnerbait',
            primary_species: ['Walleye'],
            best_conditions: { water_clarity: { Stained: 0.9 } },
            target_cover: ['Drop-off'],
            presentation: { retrieve: 'Slow roll' }
        },
        {
            name: 'Ice Jig', category: 'Jig',
            primary_species: ['Walleye'],
            best_conditions: { water_clarity: { Clear: 0.7 } },
            ice_only: true,
            target_cover: ['Deep basin'],
            presentation: { retrieve: 'Deadstick' }
        }
    ]
};

describe('Lure Scorer', () => {
    const scorer = createLureScorer(mockLureData);

    it('filters by species - excludes non-matching species', () => {
        const results = scorer.scoreLures({
            speciesName: 'Largemouth Bass', waterColor: 'Clear',
            strategyType: 'Balanced', biteProb: 0.8, isIceFishing: false
        });
        const names = results.map(r => r.name);
        assert.ok(!names.includes('Walleye Spinner'),
            'Should exclude Walleye-only lure when targeting Bass');
        assert.ok(names.includes('Reaction Crankbait'),
            'Should include Bass-matching lure');
    });

    it('filters ice-only lures when not ice fishing', () => {
        const results = scorer.scoreLures({
            speciesName: 'Walleye', waterColor: 'Clear',
            strategyType: 'Balanced', biteProb: 0.8, isIceFishing: false
        });
        const names = results.map(r => r.name);
        assert.ok(!names.includes('Ice Jig'), 'Should exclude ice-only lure in non-ice conditions');
    });

    it('includes ice-only lures when ice fishing', () => {
        const results = scorer.scoreLures({
            speciesName: 'Walleye', waterColor: 'Clear',
            strategyType: 'Finesse', biteProb: 0.5, isIceFishing: true
        });
        const names = results.map(r => r.name);
        assert.ok(names.includes('Ice Jig'), 'Should include ice-only lure in ice conditions');
    });

    it('applies Reaction strategy boost to Crankbait category', () => {
        const reaction = scorer.scoreLures({
            speciesName: 'Largemouth Bass', waterColor: 'Clear',
            strategyType: 'Reaction', biteProb: 0.8, isIceFishing: false
        });
        const balanced = scorer.scoreLures({
            speciesName: 'Largemouth Bass', waterColor: 'Clear',
            strategyType: 'Balanced', biteProb: 0.8, isIceFishing: false
        });
        const crankInReaction = reaction.find(r => r.name === 'Reaction Crankbait');
        const crankInBalanced = balanced.find(r => r.name === 'Reaction Crankbait');
        assert.ok(crankInReaction, 'Crankbait should appear in Reaction results');
        assert.ok(crankInBalanced, 'Crankbait should appear in Balanced results');
        assert.equal(crankInReaction.rank, 'Excellent', 'Boosted crankbait should rank Excellent');
    });

    it('applies Finesse strategy boost to Jig category', () => {
        const results = scorer.scoreLures({
            speciesName: 'Largemouth Bass', waterColor: 'Clear',
            strategyType: 'Finesse', biteProb: 0.5, isIceFishing: false
        });
        const jig = results.find(r => r.name === 'Finesse Jig');
        assert.ok(jig, 'Jig should appear in Finesse results');
        // 0.8 clarity * 1.5 finesse boost * 0.5 bite = 0.60 -> Good (60% < 65% threshold)
        assert.equal(jig.rank, 'Good', 'Jig with finesse boost at 60% should rank Good');
    });

    it('returns max 3 lures sorted by score', () => {
        const results = scorer.scoreLures({
            speciesName: null, waterColor: 'Clear',
            strategyType: 'Reaction', biteProb: 0.9, isIceFishing: false
        });
        assert.ok(results.length <= 3, 'Should return max 3 lures, got ' + results.length);
        for (let i = 1; i < results.length; i++) {
            assert.ok(['Excellent', 'Very Good', 'Good'].includes(results[i].rank));
        }
    });

    it('exposes STRATEGY_CATEGORY_MAP for extensibility', () => {
        assert.ok(scorer.STRATEGY_CATEGORY_MAP, 'Should expose strategy map');
        assert.ok(Array.isArray(scorer.STRATEGY_CATEGORY_MAP.Reaction), 'Reaction should be array');
        assert.ok(scorer.STRATEGY_CATEGORY_MAP.Reaction.includes('Crankbait'),
            'Reaction map should include Crankbait');
    });
});

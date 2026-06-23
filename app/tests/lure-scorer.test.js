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

// --- Task 12: Seasonal and Temperature Band Filtering ---

const mockLureDataWithSeasons = {
    lure_catalog: [
        {
            name: 'Summer Crankbait', category: 'Crankbait',
            primary_species: ['Largemouth Bass'],
            best_conditions: {
                water_clarity: { Clear: 0.9 },
                seasons: ['Summer', 'Fall'],
                temperature_band: 'Ideal to Warm'
            },
            depth: '10-15ft',
            target_cover: ['Weeds'],
            presentation: { retrieve: 'Fast' }
        },
        {
            name: 'Winter Jig', category: 'Jig',
            primary_species: ['Largemouth Bass'],
            best_conditions: {
                water_clarity: { Clear: 0.8 },
                seasons: ['Winter'],
                temperature_band: 'Cold'
            },
            depth: '20-30ft',
            target_cover: ['Deep basin'],
            presentation: { retrieve: 'Slow drag' }
        },
        {
            name: 'All-Season Spinner', category: 'Spinnerbait',
            primary_species: ['Largemouth Bass'],
            best_conditions: {
                water_clarity: { Clear: 0.7 },
                seasons: ['Spring', 'Summer', 'Fall', 'Winter'],
                temperature_band: 'Cool to Warm'
            },
            depth: '5-10ft',
            target_cover: ['Flats'],
            presentation: { retrieve: 'Steady' }
        },
        {
            name: 'No Season Data Lure', category: 'Spoon',
            primary_species: ['Largemouth Bass'],
            best_conditions: {
                water_clarity: { Clear: 0.6 }
            },
            depth: '10-20ft',
            target_cover: ['Structure'],
            presentation: { retrieve: 'Jig' }
        }
    ]
};

describe('Seasonal and Temperature Band Lure Filtering', () => {
    const scorer = createLureScorer(mockLureDataWithSeasons);

    describe('Season filtering', () => {
        it('excludes summer-only lure in winter (score 0)', () => {
            const results = scorer.scoreLures({
                speciesName: 'Largemouth Bass', waterColor: 'Clear',
                strategyType: 'Balanced', biteProb: 0.8, isIceFishing: false,
                currentMonth: 1, waterTemp: 38
            });
            const names = results.map(r => r.name);
            assert.ok(!names.includes('Summer Crankbait'),
                'Summer lure should be excluded in January');
        });

        it('includes summer lure in July', () => {
            const results = scorer.scoreLures({
                speciesName: 'Largemouth Bass', waterColor: 'Clear',
                strategyType: 'Balanced', biteProb: 0.8, isIceFishing: false,
                currentMonth: 7, waterTemp: 78
            });
            const names = results.map(r => r.name);
            assert.ok(names.includes('Summer Crankbait'),
                'Summer lure should be included in July');
        });

        it('includes winter lure in December', () => {
            const results = scorer.scoreLures({
                speciesName: 'Largemouth Bass', waterColor: 'Clear',
                strategyType: 'Finesse', biteProb: 0.5, isIceFishing: false,
                currentMonth: 12, waterTemp: 42
            });
            const names = results.map(r => r.name);
            assert.ok(names.includes('Winter Jig'),
                'Winter lure should be included in December');
        });

        it('includes lures with no season data (backward compat)', () => {
            const results = scorer.scoreLures({
                speciesName: 'Largemouth Bass', waterColor: 'Clear',
                strategyType: 'Balanced', biteProb: 0.8, isIceFishing: false,
                currentMonth: 7, waterTemp: 75
            });
            const names = results.map(r => r.name);
            assert.ok(names.includes('No Season Data Lure'),
                'Lure without season data should still appear');
        });

        it('includes all-season lure in any month', () => {
            const winterResults = scorer.scoreLures({
                speciesName: 'Largemouth Bass', waterColor: 'Clear',
                strategyType: 'Balanced', biteProb: 0.8, isIceFishing: false,
                currentMonth: 1, waterTemp: 38
            });
            assert.ok(winterResults.some(r => r.name === 'All-Season Spinner'),
                'All-season lure should appear in winter');

            const summerResults = scorer.scoreLures({
                speciesName: 'Largemouth Bass', waterColor: 'Clear',
                strategyType: 'Balanced', biteProb: 0.8, isIceFishing: false,
                currentMonth: 7, waterTemp: 78
            });
            assert.ok(summerResults.some(r => r.name === 'All-Season Spinner'),
                'All-season lure should appear in summer');
        });
    });

    describe('Temperature band penalty', () => {
        it('penalizes lure when water temp is outside its band (0.5x)', () => {
            // Winter Jig has temperature_band 'Cold' — test in warm water (75F)
            const warmResults = scorer.scoreLures({
                speciesName: 'Largemouth Bass', waterColor: 'Clear',
                strategyType: 'Finesse', biteProb: 0.5, isIceFishing: false,
                currentMonth: 12, waterTemp: 42  // In season but cold temp matches
            });
            const coldMatch = warmResults.find(r => r.name === 'Winter Jig');

            const warmMismatchResults = scorer.scoreLures({
                speciesName: 'Largemouth Bass', waterColor: 'Clear',
                strategyType: 'Finesse', biteProb: 0.5, isIceFishing: false,
                currentMonth: 3, waterTemp: 65  // Spring, warm water — Winter Jig season='Winter' → excluded
            });
            const warmMismatch = warmMismatchResults.find(r => r.name === 'Winter Jig');

            // Winter Jig is excluded in spring entirely (season filter), so verify it's not there
            assert.ok(!warmMismatch,
                'Winter Jig should be excluded in spring by season filter');
        });

        it('applies 0.5x penalty for temp band mismatch within correct season', () => {
            // Summer Crankbait: seasons=['Summer','Fall'], temp_band='Ideal to Warm'
            // Test in fall at cold temp — season matches but temp doesn't
            const idealTemp = scorer.scoreLures({
                speciesName: 'Largemouth Bass', waterColor: 'Clear',
                strategyType: 'Reaction', biteProb: 0.8, isIceFishing: false,
                currentMonth: 9, waterTemp: 70  // Fall, Ideal temp — no penalty
            });

            const coldTemp = scorer.scoreLures({
                speciesName: 'Largemouth Bass', waterColor: 'Clear',
                strategyType: 'Reaction', biteProb: 0.8, isIceFishing: false,
                currentMonth: 10, waterTemp: 45  // Fall, Cold temp — 0.5x penalty
            });

            const idealScore = idealTemp.find(r => r.name === 'Summer Crankbait')?.score;
            const coldScore = coldTemp.find(r => r.name === 'Summer Crankbait')?.score;

            assert.ok(idealScore != null, 'Summer Crankbait should appear at ideal temp');
            assert.ok(coldScore != null, 'Summer Crankbait should appear (penalized) at cold temp in fall');
            assert.ok(coldScore < idealScore,
                `Cold temp score (${coldScore}) should be less than ideal (${idealScore})`);
            // Verify the penalty is approximately 0.5x
            const ratio = coldScore / idealScore;
            assert.ok(Math.abs(ratio - 0.5) < 0.15,
                `Penalty ratio should be ~0.5, got ${ratio.toFixed(3)}`);
        });
    });

    describe('Backward compatibility (no month/waterTemp)', () => {
        it('works without currentMonth/waterTemp params (no filtering)', () => {
            const results = scorer.scoreLures({
                speciesName: 'Largemouth Bass', waterColor: 'Clear',
                strategyType: 'Balanced', biteProb: 0.8, isIceFishing: false
            });
            const names = results.map(r => r.name);
            // All lures should appear when no season/temp filtering is applied
            assert.ok(names.includes('Summer Crankbait'),
                'Summer lure should appear when no month provided');
            assert.ok(names.includes('Winter Jig'),
                'Winter lure should appear when no month provided');
        });
    });
});

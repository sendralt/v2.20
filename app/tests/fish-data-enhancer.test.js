"use strict";
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { extractSpeciesSection } = require('../src/services/fish-data-enhancer');

// Sample research document for testing
const SAMPLE_DOC = `# Fish Behavior Patterns — Comprehensive Research

## Abstract
Some abstract text here.

## Introduction
Introduction text.

## Species-Specific Analyses

### 1. Largemouth Bass (*Micropterus salmoides*)

Largemouth Bass are ambush predators that prefer warm water.
Feeding peaks at dawn and dusk. They relate to structure.
Top lures: plastic worms, jigs, crankbaits.

### 2. Smallmouth Bass (*Micropterus dolomieu*)

Smallmouth Bass prefer cooler, rocky waters.
They are aggressive fighters and chase baitfish.
Top lures: tubes, ned rigs, crankbaits.

### 3. Rainbow Trout (*Oncorhynchus mykiss*) and 4. Brown Trout (*Salmo trutta*)

Rainbow and Brown Trout are cold-water species.
They feed on insects, baitfish, and crustaceans.
Brown trout are more nocturnal than rainbows.

### 5. Walleye (*Sander vitreus*)

Walleye are low-light predators with excellent night vision.
They feed actively at dawn, dusk, and night.
They relate to weed edges and drop-offs.

### 6. Channel Catfish (*Ictalurus punctatus*)

Channel Catfish are bottom feeders with strong olfactory senses.
They are most active at night and in turbid water.

## Discussion and Conclusion

This document summarizes behavioral patterns.
Further research is ongoing.
`;

describe('extractSpeciesSection', () => {
    describe('Species header matching', () => {
        it('extracts Largemouth Bass section correctly', () => {
            const result = extractSpeciesSection(SAMPLE_DOC, 'Largemouth Bass');
            assert.ok(result.includes('Largemouth Bass'), 'Should contain species name');
            assert.ok(result.includes('ambush predators'), 'Should contain species content');
            assert.ok(!result.includes('Smallmouth Bass'), 'Should not contain next species');
        });

        it('extracts Walleye section correctly', () => {
            const result = extractSpeciesSection(SAMPLE_DOC, 'Walleye');
            assert.ok(result.includes('Walleye'), 'Should contain species name');
            assert.ok(result.includes('low-light predators'), 'Should contain species content');
            assert.ok(!result.includes('Channel Catfish'), 'Should not contain next species');
        });

        it('extracts Smallmouth Bass section (stops at next ### header)', () => {
            const result = extractSpeciesSection(SAMPLE_DOC, 'Smallmouth Bass');
            assert.ok(result.includes('Smallmouth Bass'), 'Should contain species name');
            assert.ok(result.includes('cooler, rocky waters'), 'Should contain species content');
            assert.ok(!result.includes('Rainbow'), 'Should not contain next species section');
        });
    });

    describe('Shared headers (multiple species in one section)', () => {
        it('extracts Brown Trout from combined Rainbow+Brown Trout header', () => {
            const result = extractSpeciesSection(SAMPLE_DOC, 'Brown Trout');
            assert.ok(result.includes('Brown Trout'), 'Should contain species name');
            assert.ok(result.includes('cold-water species'), 'Should contain section content');
            assert.ok(result.includes('nocturnal'), 'Should include nocturnal info for brown trout');
        });

        it('extracts Rainbow Trout from same combined header', () => {
            const result = extractSpeciesSection(SAMPLE_DOC, 'Rainbow Trout');
            assert.ok(result.includes('Rainbow Trout'), 'Should contain species name');
            assert.ok(result.includes('cold-water species'), 'Should contain section content');
        });
    });

    describe('Case-insensitive matching', () => {
        it('matches lowercase species name', () => {
            const result = extractSpeciesSection(SAMPLE_DOC, 'walleye');
            assert.ok(result.includes('Walleye'), 'Should match case-insensitively');
            assert.ok(result.includes('low-light'), 'Should extract correct section');
        });

        it('matches uppercase species name', () => {
            const result = extractSpeciesSection(SAMPLE_DOC, 'WALLEYE');
            assert.ok(result.includes('Walleye'), 'Should match case-insensitively');
        });
    });

    describe('Fallback behavior', () => {
        it('falls back to truncation when species not found', () => {
            const longDoc = 'A'.repeat(8000);
            const result = extractSpeciesSection(longDoc, 'Nonexistent Species');
            assert.ok(result.length <= 5000, `Should truncate to 5000 chars, got ${result.length}`);
            assert.equal(result, 'A'.repeat(5000));
        });

        it('returns full short doc when species not found and doc is short', () => {
            const shortDoc = 'Short document.';
            const result = extractSpeciesSection(shortDoc, 'Nonexistent Species');
            assert.equal(result, shortDoc);
        });

        it('handles null or empty species name', () => {
            const result = extractSpeciesSection(SAMPLE_DOC, null);
            assert.ok(result.length <= 5000, 'Should fallback to truncation');
        });
    });

    describe('Edge cases', () => {
        it('handles empty document', () => {
            const result = extractSpeciesSection('', 'Walleye');
            assert.equal(result, '');
        });

        it('extracts last species in document (stops at ## not ###)', () => {
            const result = extractSpeciesSection(SAMPLE_DOC, 'Channel Catfish');
            assert.ok(result.includes('Channel Catfish'), 'Should contain species name');
            assert.ok(result.includes('bottom feeders'), 'Should contain species content');
            assert.ok(!result.includes('Discussion'), 'Should not include Discussion section');
        });
    });
});

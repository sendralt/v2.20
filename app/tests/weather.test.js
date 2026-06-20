"use strict";

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { generateSearchVariations } = require('../src/services/weather');

describe('generateSearchVariations', () => {
    it('does not produce bare state names from comma split', () => {
        // Regression: "Spring Valley Wetland, Ohio" produced "Ohio" as a standalone
        // search term, which geocoded to the geographic center of Ohio (near Columbus)
        // and caused Alum Creek at Africa OH to appear as the nearest USGS station.
        const variations = generateSearchVariations('Spring Valley Wetland, Ohio');
        assert.ok(!variations.includes('Ohio'), 'should NOT contain bare state name "Ohio"');
        assert.ok(variations.includes('Spring Valley Wetland, Ohio'), 'should contain full location');
        assert.ok(variations.includes('Spring Valley Wetland'), 'should contain location without state');
    });

    it('preserves multi-word county/region from comma split', () => {
        const variations = generateSearchVariations('Lake Erie, Ottawa County, Ohio');
        assert.ok(!variations.includes('Ohio'), 'should NOT contain bare state name');
        assert.ok(variations.includes('Ottawa County, Ohio'), 'should contain multi-word remainder');
        assert.ok(variations.includes('Ottawa County'), 'should contain multi-word county name');
    });

    it('handles no-comma input unchanged', () => {
        const variations = generateSearchVariations('Lake Michigan');
        assert.ok(variations.includes('Lake Michigan'), 'should contain original');
    });

    it('does not produce bare state for simple city, state', () => {
        const variations = generateSearchVariations('Columbus, Ohio');
        assert.ok(!variations.includes('Ohio'), 'should NOT contain bare state name');
        assert.ok(variations.includes('Columbus'), 'should contain city name');
    });
});

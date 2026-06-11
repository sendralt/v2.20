"use strict";

const path = require('path');
const fs = require('fs');

function loadJson(filePath, fallback) {
    if (!fs.existsSync(filePath)) {
        console.warn(`\u26a0 ${path.basename(filePath)} not found`);
        return fallback;
    }
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (err) {
        console.warn(`\u26a0 Failed to parse ${path.basename(filePath)}:`, err.message);
        return fallback;
    }
}

function loadText(filePath, fallback = '') {
    if (!fs.existsSync(filePath)) {
        console.warn(`\u26a0 ${path.basename(filePath)} not found`);
        return fallback;
    }
    try {
        return fs.readFileSync(filePath, 'utf-8');
    } catch (err) {
        console.warn(`\u26a0 Failed to load ${path.basename(filePath)}:`, err.message);
        return fallback;
    }
}

function loadFirstExistingText(filePaths, fallback = '') {
    for (const filePath of filePaths) {
        if (fs.existsSync(filePath)) {
            return loadText(filePath, fallback);
        }
    }
    console.warn(`\u26a0 None of the text files were found: ${filePaths.map(filePath => path.relative(process.cwd(), filePath)).join(', ')}`);
    return fallback;
}

function loadAllData(rootDir) {
    const fishingData = loadJson(path.join(rootDir, 'fishingData.json'), { species_data: [] });
    const lureData = loadJson(path.join(rootDir, 'lures.json'), { lure_catalog: [] });
    const fishPatterns = loadFirstExistingText([
        path.join(rootDir, 'fish-behavior-patterns.md'),
        path.join(rootDir, 'docs', 'fish-behavior-patterns.md')
    ]);

    if (fishingData.species_data?.length) console.log('\u2713 Scientific species data loaded');
    else console.warn('\u26a0 Scientific engine will use fallbacks');

    if (Array.isArray(lureData.lure_catalog) && lureData.lure_catalog.length) console.log('\u2713 Lure catalog loaded');
    else if (Array.isArray(lureData) && lureData.length) console.log('\u2713 Lure catalog loaded (flat array)');
    else console.warn('\u26a0 Lure recommendations will be unavailable');

    if (fishPatterns) console.log('\u2713 Fish behavior patterns loaded');

    return { fishingData, lureData, fishPatterns };
}

module.exports = { loadAllData };

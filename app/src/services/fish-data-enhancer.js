"use strict";

/**
 * Fish Data Enhancer — Dynamic Research Document Extraction
 *
 * Extracts the species-relevant section from the research document instead of
 * hard-truncating at 5000 chars. This ensures the AI sees the full behavioral
 * context for the target species.
 *
 * Strategy:
 * 1. Find the ### header containing the species name (case-insensitive)
 * 2. Extract from that header to the next ### or ## header
 * 3. Fall back to 5000-char truncation if species not found
 */

/** MAX_FALLBACK_CHARS: Character limit for fallback truncation when species section is not found. [Source: heuristic — matches former hard-truncation limit] */
const MAX_FALLBACK_CHARS = 5000;

/**
 * Extract the species-specific section from the research document.
 *
 * Finds the ### header containing the species name and returns all content
 * from that header to the next ### or ## header. Falls back to truncation
 * if the species is not found.
 *
 * @param {string} fishPatterns - Full research document text
 * @param {string|null|undefined} speciesName - Name of the species to extract
 * @returns {string} Extracted species section or truncated fallback
 */
function extractSpeciesSection(fishPatterns, speciesName) {
    if (!fishPatterns) return '';

    // If no species name provided, fall back to truncation
    if (!speciesName || speciesName.trim() === '') {
        return fishPatterns.substring(0, MAX_FALLBACK_CHARS);
    }

    const lines = fishPatterns.split('\n');
    const speciesLower = speciesName.toLowerCase();

    let startIndex = -1;
    let endIndex = lines.length;

    // Find the ### header line containing the species name
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Match ### level headers (species sections)
        if (/^###\s/.test(line) && line.toLowerCase().includes(speciesLower)) {
            startIndex = i;
            break;
        }
    }

    // Species not found — fall back to truncation
    if (startIndex === -1) {
        return fishPatterns.substring(0, MAX_FALLBACK_CHARS);
    }

    // Find the next ### or ## header after the species section
    for (let i = startIndex + 1; i < lines.length; i++) {
        const line = lines[i];
        // Stop at next ### (species) or ## (major section like Discussion)
        if (/^#{2,3}\s/.test(line)) {
            endIndex = i;
            break;
        }
    }

    return lines.slice(startIndex, endIndex).join('\n').trimEnd();
}

module.exports = { extractSpeciesSection };

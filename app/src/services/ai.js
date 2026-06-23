'use strict';
const zlib = require('zlib');
const https = require('https');

// Token usage tracking
const { deriveActivityForecast } = require('../engine/activity-forecast');
const { extractSpeciesSection } = require('./fish-data-enhancer');
const { getMoonPhase } = require('../engine/lunar');
const tokenUsageStore = [];
const MAX_STORED_REQUESTS = 1000;
const GEMINI_PRICING = {
    'gemini-3-flash-preview': { inputPerM: 0.50, outputPerM: 3.00 }
};

// H-4: Prompt injection mitigation constants
const MAX_INPUT_LENGTH = 200;
const CONTROL_CHAR_REGEX = /[\x00-\x1F\x7F]/g;
const TEMPLATE_CHARS_REGEX = /[{}<>]/g;

function calculateCostUSD(model, inputTokens, outputTokens) {
    const pricing = GEMINI_PRICING[model] || { inputPerM: 0.50, outputPerM: 3.00 };
    return (inputTokens / 1_000_000 * pricing.inputPerM) + (outputTokens / 1_000_000 * pricing.outputPerM);
}


function getWindDirection(degrees) {
    const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
    return dirs[Math.round(degrees / 22.5) % 16];
}

function ensureString(val) {
    if (Array.isArray(val)) return val.join('\n');
    if (typeof val === 'string') return val;
    return String(val || '');
}

/**
 * H-4: Sanitize user-supplied inputs before interpolation into AI prompts.
 * Strips control characters, template syntax chars, and limits length.
 * @param {*} value - The raw user input
 * @returns {string} Sanitized string safe for prompt interpolation
 */
function sanitizePromptInput(value) {
    const str = typeof value === 'string' ? value : String(value || '');
    return str
        .replace(CONTROL_CHAR_REGEX, '')
        .replace(TEMPLATE_CHARS_REGEX, '')
        .slice(0, MAX_INPUT_LENGTH)
        .trim();
}

function generateDefaultActivity() {
    return [6, 7, 8, 9, 8, 7, 6, 5, 4, 5, 6, 7];
}

function parseHour(timeStr) {
    if (!timeStr) return new Date().getHours();
    const match = timeStr.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
    if (!match) return new Date().getHours();
    let h = parseInt(match[1]);
    if (match[3].toLowerCase() === 'pm' && h !== 12) h += 12;
    if (match[3].toLowerCase() === 'am' && h === 12) h = 0;
    return h;
}

function buildGenerationPrompt(params) {
    // H-4: Sanitize all user-supplied inputs before prompt interpolation
    const safeSpecies = sanitizePromptInput(params.species);
    const safeLocation = sanitizePromptInput(params.location);
    const safeClarity = sanitizePromptInput(params.clarity);
    const safeTime = sanitizePromptInput(params.currentTime);
    const safeCounty = params.county ? sanitizePromptInput(params.county) : null;

    return `
You are an Elite Pro Fishing Guide with 30+ years of experience. Generate a highly detailed, actionable strategy for ${safeSpecies} at ${safeLocation}${safeCounty ? ', ' + safeCounty + ' County' : ''}.

INPUTS:
- Water Clarity: ${safeClarity}
- Style: ${params.isBoat ? 'Boat' : 'Shore'}
- Local Time: ${safeTime}
- Behavior Data: ${params.fishPatterns}
- Live Weather: ${params.weatherContext}
- Scientific Guidance: ${params.scientificContext}
- GPS Coordinates: ${params.lat || 'N/A'}, ${params.lon || 'N/A'}${safeCounty ? '\n- County: ' + safeCounty + ' County' : ''}

OUTPUT FORMAT (JSON):
{
    "strategy": "Your detailed strategy here. Use Markdown formatting. Include specific techniques, lure recommendations, depth ranges, and how current conditions affect the bite.",
    "safety": "Brief safety advisory specific to current conditions (2-3 sentences covering weather risks, water safety, gear recommendations). Do NOT mention bite probability.",
    "intel": "Detailed localized fishing intelligence. Explain why the fish are where they are based on the inputs (weather, clarity, species behavior). Use 3-5 sentences.",
    "solunar": {
        "assessment": "Brief assessment of how the PROVIDED moon phase and weather conditions are currently affecting fish activity. Do NOT guess the moon phase — use the computed value given above."
    },
    "forecast_note": "2-3 sentence qualitative note about the activity forecast. Reference the engine's hourly projections and add fishing-specific reasoning (e.g., 'The engine projects a strong dawn peak, but with rising pressure expect the bite window to compress. Focus on the first 90 minutes after sunrise.') Do NOT repeat the numbers — add insight the numbers alone don't show.",
    "ai_lures": [
        {
            "name": "Specific lure name (e.g., 'Ned Rig with Finesse Worm Z-Man')",
            "category": "Lure category (e.g., 'Finesse', 'Reaction', 'Topwater', 'Jig', 'Soft Plastic')",
            "score": 0.0-1.0 confidence rating for how well this lure matches current conditions,
            "rank": "Excellent if score>0.85, Very Good if score>0.65, Good otherwise",
            "cover": "Target cover or structure type",
            "presentation": "Specific retrieve technique and presentation advice",
            "reason": "Why this lure fits the current conditions (1-2 sentences)"
        }
    ]
}

STRICT RULES:
- Consider barometric pressure trends, moon phase, and weather conditions in your assessment
- Use the scientific guidance when choosing lure style, depth, and presentation
- Provide specific, actionable advice - not generic tips
- Include depth ranges and specific techniques for the conditions
- Reference specific local features of the water body when you have knowledge of them (bridges, coves, points, creeks, parks, boat ramps, road crossings). If you know the area, name it specifically. If uncertain about a specific feature, describe the TYPE of area instead (e.g., 'the north end near the inlet' rather than guessing a wrong name).
- NEVER mention a specific bite probability percentage in your strategy, safety, or intel text. The bite probability is calculated by a separate scientific engine — do not guess or state your own number.
- For ai_lures: suggest 2-3 lures that COMPLEMENT the engine's picks. Do NOT repeat lures already in ENGINE LURE PICKS. Focus on lures the engine catalog may not cover (e.g., Ned rigs, drop shots, swimbaits, umbrella rigs, specific color recommendations). Score each lure 0.0-1.0 based on how well it matches the species, water clarity, temperature, and strategy. Return an empty array if conditions are straightforward and engine picks suffice.
`;
}

// Token usage reporting functions
function recordTokenUsage(usageData) {
    const costUSD = calculateCostUSD(
        usageData.model || 'gemini-3-flash-preview',
        usageData.inputTokens || 0,
        usageData.outputTokens || 0
    );
    const record = {
        timestamp: new Date().toISOString(),
        inputTokens: usageData.inputTokens || 0,
        outputTokens: usageData.outputTokens || 0,
        totalTokens: usageData.totalTokenCount || 0,
        costUSD,
        model: usageData.model || 'unknown',
        location: usageData.location || 'unknown',
        species: usageData.species || 'unknown'
    };

    tokenUsageStore.push(record);

    // Keep only recent records
    if (tokenUsageStore.length > MAX_STORED_REQUESTS) {
        tokenUsageStore.shift();
    }

    return record;
}

function getTokenUsageReport(options = {}) {
    const { startTime, endTime, limit = 100 } = options;

    let filtered = tokenUsageStore;

    if (startTime) {
        filtered = filtered.filter(r => new Date(r.timestamp) >= new Date(startTime));
    }
    if (endTime) {
        filtered = filtered.filter(r => new Date(r.timestamp) <= new Date(endTime));
    }

    const recent = filtered.slice(-limit);

    const totals = recent.reduce((acc, r) => ({
        inputTokens: acc.inputTokens + r.inputTokens,
        outputTokens: acc.outputTokens + r.outputTokens,
        totalTokens: acc.totalTokens + r.totalTokens,
        totalCostUSD: acc.totalCostUSD + (r.costUSD || 0)
    }), { inputTokens: 0, outputTokens: 0, totalTokens: 0, totalCostUSD: 0 });

    return {
        summary: {
            totalRequests: recent.length,
            ...totals,
            averageInputTokens: recent.length > 0 ? Math.round(totals.inputTokens / recent.length) : 0,
            averageOutputTokens: recent.length > 0 ? Math.round(totals.outputTokens / recent.length) : 0,
            averageCostUSD: recent.length > 0 ? totals.totalCostUSD / recent.length : 0
        },
        requests: recent
    };
}

/**
 * Direct Gemini REST API call with optional Google Search grounding.
 * Uses two-call pattern when grounding + JSON mode are both needed.
 */
async function callGeminiDirect(apiKey, model, prompt, isDev, useGrounding = false) {
    const baseUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    function makeRequest(bodyObj) {
        const body = JSON.stringify(bodyObj);
        return new Promise((resolve, reject) => {
            const req = https.request(baseUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept-Encoding': 'identity',
                    'Content-Length': Buffer.byteLength(body)
                }
            }, (res) => {
                const chunks = [];
                res.on('data', chunk => chunks.push(chunk));
                res.on('end', () => {
                    try {
                        const buf = Buffer.concat(chunks);
                        const encoding = (res.headers['content-encoding'] || '').toLowerCase();
                        let text;
                        if (encoding === 'gzip') {
                            text = zlib.gunzipSync(buf).toString('utf8');
                        } else if (encoding === 'deflate') {
                            text = zlib.inflateSync(buf).toString('utf8');
                        } else if (encoding === 'br') {
                            text = zlib.brotliDecompressSync(buf).toString('utf8');
                        } else {
                            text = buf.toString('utf8');
                        }
                        if (isDev) console.log('[Gemini direct] Response received, length:', text.length, 'encoding:', encoding || 'none');
                        resolve(text);
                    } catch (err) {
                        reject(err);
                    }
                });
                res.on('error', reject);
            });
            req.on('error', reject);
            req.setTimeout(25000, () => {
                req.destroy(new Error('Gemini API request timed out'));
            });
            req.write(body);
            req.end();
        });
    }

    // No grounding: original single-call behavior (JSON mode)
    if (!useGrounding) {
        return makeRequest({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json' }
        });
    }

    // Two-call grounding pattern:
    // Call 1: Google Search grounding (no JSON mode) → grounded text
    if (isDev) console.log('[Gemini grounding] Call 1: grounded search');
    const groundedRaw = await makeRequest({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
        generationConfig: { temperature: 0.7 }
    });
    const groundedData = JSON.parse(groundedRaw);
    if (groundedData.error) throw new Error(groundedData.error.message || 'Gemini grounding error');
    const groundedText = groundedData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!groundedText) throw new Error('No text in grounded response');

    // Call 2: Structure grounded text into JSON (JSON mode, no tools)
    if (isDev) console.log('[Gemini grounding] Call 2: structure to JSON');
    return makeRequest({
        contents: [{ parts: [{ text: `Based on this information, generate the JSON response as specified in the original prompt:\n\n---\n${groundedText}\n---\n\nOriginal prompt for reference:\n${prompt}` }] }],
        generationConfig: { responseMimeType: 'application/json' }
    });
}

/**
 * Merge engine and AI lure recommendations into a single ranked list.
 * Tags each lure with source, normalizes names for dedup,
 * sorts by score descending, caps at 5 total.
 * @param {Array} engineLures - Lures from the deterministic lure-scorer
 * @param {Array} aiLures - Lures from the Gemini AI response
 * @returns {Array} Merged, deduped, ranked lure list (max 5)
 */
function mergeLures(engineLures, aiLures) {
    const MAX_LURES = 5;

    const normalizeName = (name) =>
        String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');

    // Tag source and normalize score field
    const tagged = [];

    if (Array.isArray(engineLures)) {
        for (const lure of engineLures) {
            if (!lure || !lure.name) continue;
            tagged.push({
                name: lure.name,
                score: typeof lure.score === 'number' ? lure.score : 0,
                rank: lure.rank || 'Good',
                cover: lure.cover || 'Key structure',
                presentation: lure.presentation || 'Match local forage and structure.',
                reason: lure.reason || 'Offline lure catalog match.',
                source: 'engine'
            });
        }
    }

    if (Array.isArray(aiLures)) {
        for (const lure of aiLures) {
            if (!lure || !lure.name) continue;
            tagged.push({
                name: lure.name,
                score: typeof lure.score === 'number' ? lure.score : 0,
                rank: lure.rank || 'Good',
                cover: lure.cover || 'Key structure',
                presentation: lure.presentation || 'Match local forage and structure.',
                reason: lure.reason || 'AI-generated recommendation.',
                source: 'ai'
            });
        }
    }

    // Sort by score descending
    tagged.sort((a, b) => b.score - a.score);

    // Dedupe by normalized name (first occurrence wins, already sorted by score)
    const seen = new Set();
    const merged = [];
    for (const lure of tagged) {
        const norm = normalizeName(lure.name);
        if (seen.has(norm)) continue;
        seen.add(norm);
        merged.push(lure);
        if (merged.length >= MAX_LURES) break;
    }

    return merged;
}

function createAIService(deps) {
    const { genAI, weatherService, biteEngine, fishPatterns, isDev } = deps;
    // Extract API key from genAI instance for direct REST calls
    const geminiApiKey = genAI ? genAI.apiKey : null;

    /**
     * Build a user-facing note explaining water temperature estimation.
     * Only shown when the source is NOT live USGS sensor data.
     * @param {string} source - water_temp_source value
     * @returns {string|null} Explanation note, or null for live data
     */
    function buildWaterTempNote(source) {
        if (source === 'usgs-live') return null;
        switch (source) {
            case 'estimated':
            case 'hybrid-thermal-lag':
                return 'Water temperature estimated from air temp and seasonal baselines — no nearby USGS monitoring station available.';
            case 'offline':
                return 'Water temperature unavailable — using seasonal estimation model.';
            case 'error':
                return 'Water temperature sensor data error — using estimation model.';
            default:
                return 'Water temperature source unknown — treat estimate with caution.';
        }
    }

    async function buildOfflineStrategy(params, weather, reason) {
        const { location, species, clarity, currentTime } = params;
        const currentHour = parseHour(currentTime);
        const scientificData = await biteEngine.calculateScientificStrategy(
            {
                speciesName: species,
                waterColor: clarity,
                location,
                lat: weather?.lat,
                lon: weather?.lon
            },
            weather,
            { useLureCatalog: true, hour: currentHour }
        );
        const topLure = scientificData?.recommendedLures?.[0] || null;
        const backupLure = scientificData?.recommendedLures?.[1] || null;
        const strategy = topLure
            ? `Offline mode strategy for ${species}: start with ${topLure.name} around ${topLure.cover}. ${topLure.presentation || 'Match lure depth and cadence to fish activity.'} ${backupLure ? `If needed, rotate to ${backupLure.name} as a secondary option.` : ''}`
            : `Offline mode strategy for ${species}: focus on structure, adjust lure size and color to water clarity, and slow down presentations when conditions are tough.`;
        const intel = topLure
            ? `Offline catalog match: ${topLure.reason || 'Local lure catalog selected this option.'}`
            : 'Offline catalog fallback: use local forage, clarity, and structure cues to narrow lure choice.';
        return {
            strategy,
            safety: `Offline mode: verify weather locally before launch, wear a life jacket, and follow all local regulations. ${reason ? `Fallback reason: ${reason}.` : ''}`,
            intel, activity: generateDefaultActivity(), weather,
            scientific_data: scientificData,
            recommended_lures: scientificData?.recommendedLures || [],
            solunar: (() => {
                const moon = getMoonPhase(new Date());
                return {
                    moon_phase: moon.label,
                    moon_illumination: Math.round(moon.illumination * 100),
                    assessment: `Offline mode: ${moon.label} (${Math.round(moon.illumination * 100)}% illuminated). ` +
                        (moon.feedingMultiplier > 1.0 ? 'Solunar peak — expect enhanced feeding activity.' : 'No solunar peak currently.')
                };
            })(),
            map_url: `https://www.google.com/maps/search/${encodeURIComponent(location)}`,
            bite_probability: scientificData?.biteProbability || 0,
            bite_probability_confidence: scientificData?.biteProbabilityConfidence || { low: 0, high: 0, band: 12 },
            bite_rank: scientificData?.biteRank || 'Unavailable',
            bite_reasoning: scientificData?.biteReasoning || 'Offline scientific fallback applied.',
            pressure_forecast: weather?.pressureForecast || [],
            offline_mode: true,
            water_temp: scientificData?.waterTemp || null,
            water_temp_source: scientificData?.waterTempSource || 'offline',
            water_temp_note: buildWaterTempNote(scientificData?.waterTempSource || 'offline'),
            water_temp_station: scientificData?.waterTempStation || null,
            water_temp_station_distance: scientificData?.waterTempStationDistance || null
        };
    }

    async function generateFishingStrategy(params) {
        const { location, species, clarity, engine, isBoat, currentTime } = params;
        const weather = await weatherService.getWeatherData(location);
        const currentHour = parseHour(currentTime);
        // H-7: Enable lure catalog in online path — Pro users now get lure recommendations
        const scientificData = await biteEngine.calculateScientificStrategy(
            {
                speciesName: species,
                waterColor: clarity,
                location,
                lat: weather?.lat,
                lon: weather?.lon
            },
            weather,
            { useLureCatalog: true, hour: currentHour }
        );
        const weatherContext = weather
            ? `CURRENT WEATHER: ${weather.temp}°F (feels like ${weather.feels_like}°F), ${weather.desc}, Wind: ${weather.wind.speed} mph ${getWindDirection(weather.wind.direction)}, Pressure: ${weather.pressure}mb, Humidity: ${weather.humidity}%, Visibility: ${weather.visibility ? weather.visibility + ' mi' : 'N/A'}`
            : "WEATHER DATA: Unavailable (use seasonal averages)";
        // Compute activity forecast BEFORE LLM call so it can be used as context
        // If hourly weather data is available (Open-Meteo), runs real bite-score formula per hour
        // Otherwise falls back to simplified time×trend×metabolic composite
        const activity = scientificData
            ? deriveActivityForecast({
                currentHour: new Date().getHours(),
                pressureTrend: scientificData.pressureTrend || 'Unknown',
                metabolicEfficiency: (scientificData.metabolicEfficiency || 50) / 100,
                hourly: weather?.hourly || [],
                pressureHistory: weather?.pressureHistory || [],
                waterTemp: scientificData.waterTemp,
                speciesMetrics: scientificData.speciesMetrics,
                clarity: clarity || 'Clear'
              })
            : generateDefaultActivity();
        const activityContext = `ACTIVITY FORECAST (next 12h, 1-10 scale): [${activity.join(', ')}]`;
        const engineLureNames = (scientificData?.recommendedLures || [])
            .map(l => l.name)
            .join(', ') || 'None';
        const scientificContext = scientificData
            ? `SCIENTIFIC ENGINE: Bite ${scientificData.biteProbability}% (${scientificData.biteRank}); Metabolic Efficiency ${scientificData.metabolicEfficiency}%; Pressure Trend ${scientificData.pressureTrend}; Recommended Strategy ${scientificData.strategyType}; Water Temp ${scientificData.waterTemp}°F (${scientificData.waterTempSource}); ENGINE LURE PICKS: ${engineLureNames}; ${activityContext}`
            : 'SCIENTIFIC ENGINE: Unavailable';

        // Compute deterministic moon phase — do NOT ask AI to guess it.
        const moonData = getMoonPhase(new Date());
        const lunarContext = `MOON PHASE (computed — use this, do NOT guess): ${moonData.label}, ${Math.round(moonData.illumination * 100)}% illuminated, feeding multiplier ${moonData.feedingMultiplier.toFixed(1)}x.`;

        if (!geminiApiKey) return buildOfflineStrategy(params, weather, 'AI service unavailable');

        const model = engine || 'gemini-2.5-flash';
        const prompt = buildGenerationPrompt({
            species, location, clarity, isBoat, currentTime,
            weatherContext, scientificContext,
            lat: weather?.lat, lon: weather?.lon,
            county: weather?.county,
            fishPatterns: extractSpeciesSection(fishPatterns, species)
        });

        try {
            // Resilient Gemini call chain: try grounding (two-call) first,
            // fall back to single-call JSON mode if grounding fails.
            // Only go offline if BOTH approaches fail.
            let rawBody;
            try {
                rawBody = await callGeminiDirect(geminiApiKey, model, prompt, isDev, true);
            } catch (groundingErr) {
                console.warn('Gemini grounding failed, trying single-call JSON:', groundingErr.message);
                rawBody = await callGeminiDirect(geminiApiKey, model, prompt, isDev, false);
            }

            if (isDev) console.log('\n[Gemini raw response]\n', rawBody.substring(0, 500), '\n');

            const geminiResponse = JSON.parse(rawBody);
            if (geminiResponse.error) throw new Error(geminiResponse.error.message || 'Gemini API error');

            const text = geminiResponse.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!text) throw new Error('No text in Gemini response');

            // Extract token usage from Gemini API response
            const usageMetadata = geminiResponse.usageMetadata;
            let tokenRecord = null;
            if (usageMetadata) {
                tokenRecord = recordTokenUsage({
                    inputTokens: usageMetadata.promptTokenCount || 0,
                    outputTokens: usageMetadata.candidatesTokenCount || 0,
                    totalTokens: usageMetadata.totalTokenCount || 0,
                    model: model,
                    location: location,
                    species: species
                });

                if (isDev) {
                    console.log('\n[Token Usage]', {
                        input: usageMetadata.promptTokenCount,
                        output: usageMetadata.candidatesTokenCount,
                        total: usageMetadata.totalTokenCount
                    });
                }
            }

            let responseJson;
            try { responseJson = JSON.parse(text); }
            catch (err) { throw new Error('AI response could not be parsed'); }

            const biteMetrics = scientificData
                ? { score: scientificData.biteProbability, rank: scientificData.biteRank, reasoning: scientificData.biteReasoning }
                : await biteEngine.calculateQuickBite(weather);

            return {
                generation_cost: tokenRecord ? tokenRecord.costUSD : 0,
                strategy: ensureString(responseJson.strategy) || 'No detailed AI strategy was returned.',
                intel: ensureString(responseJson.intel) || 'Target obvious structure such as points, docks, and weed edges and specific names of key areas.',
                safety: ensureString(responseJson.safety) || 'Always wear a life jacket and follow local regulations.',
                forecast_note: ensureString(responseJson.forecast_note) || '',
                activity, weather,
                scientific_data: scientificData,
                // Merge engine lures with AI-generated lures, score-ranked
                recommended_lures: mergeLures(scientificData?.recommendedLures, responseJson.ai_lures),
                solunar: (() => {
                    const moon = getMoonPhase(new Date());
                    return {
                        moon_phase: moon.label,
                        moon_illumination: Math.round(moon.illumination * 100),
                        assessment: ensureString(responseJson.solunar?.assessment) || 'No assessment available',
                        note: 'Moon phase computed deterministically — not AI-guessed'
                    };
                })(),
                map_url: `https://www.google.com/maps/search/${encodeURIComponent(location)}`,
                bite_probability: biteMetrics.score,
                bite_probability_confidence: scientificData?.biteProbabilityConfidence || null,
                bite_rank: biteMetrics.rank,
                bite_reasoning: biteMetrics.reasoning,
                pressure_forecast: weather?.pressureForecast || [],
                water_temp: scientificData?.waterTemp || null,
                water_temp_source: scientificData?.waterTempSource || 'offline',
                water_temp_note: buildWaterTempNote(scientificData?.waterTempSource || 'offline'),
                water_temp_station: scientificData?.waterTempStation || null,
                water_temp_station_distance: scientificData?.waterTempStationDistance || null
            };
        } catch (error) {
            console.warn('Online generation unavailable, using offline fallback:', error.message);
            return buildOfflineStrategy(params, weather, error.message);
        }
    }

    return { generateFishingStrategy };
}

module.exports = { createAIService, getTokenUsageReport, recordTokenUsage, mergeLures };

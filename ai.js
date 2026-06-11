'use strict';

// Token usage tracking
const { deriveActivityForecast } = require('../engine/activity-forecast');
const tokenUsageStore = [];
const MAX_STORED_REQUESTS = 1000;
const GEMINI_PRICING = {
    'gemini-3-flash-preview': { inputPerM: 0.50, outputPerM: 3.00 }
};

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
    return `
You are an Elite Pro Fishing Guide with 30+ years of experience. Generate a highly detailed, actionable strategy for ${params.species} at ${params.location}.

INPUTS:
- Water Clarity: ${params.clarity}
- Style: ${params.isBoat ? 'Boat' : 'Shore'}
- Local Time: ${params.currentTime}
- Behavior Data: ${params.fishPatterns}
- Live Weather: ${params.weatherContext}
- Scientific Guidance: ${params.scientificContext}

OUTPUT FORMAT (JSON):
{
    "strategy": "Your detailed strategy here. Use Markdown formatting. Include specific techniques, lure recommendations, depth ranges, and how current conditions affect the bite.",
    "intel": "Detailed localized fishing intelligence. Explain why the fish are where they are based on the inputs (weather, clarity, species behavior). Use 3-5 sentences.",
    "solunar": {
        "moon_phase": "Current moon phase based on today's date",
        "assessment": "Brief assessment of how moon phase and weather conditions are currently affecting fish activity"
    }
}

- Consider barometric pressure trends, moon phase, and weather conditions in your assessment
- Use the scientific guidance when choosing lure style, depth, and presentation
- Provide specific, actionable advice - not generic tips
- Include depth ranges and specific techniques for the conditions
- NEVER mention a specific bite probability percentage in your strategy, safety, or intel text. The bite probability is calculated by a separate scientific engine — do not guess or state your own number.
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
        totalTokens: usageData.totalTokens || 0,
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

function createAIService(deps) {
    const { genAI, weatherService, biteEngine, fishPatterns, isDev } = deps;

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
            solunar: { moon_phase: 'Unknown', assessment: 'Offline mode does not include live solunar data.' },
            map_url: `https://www.google.com/maps/search/${encodeURIComponent(location)}`,
            bite_probability: scientificData?.biteProbability || 0,
            bite_rank: scientificData?.biteRank || 'Unavailable',
            bite_reasoning: scientificData?.biteReasoning || 'Offline scientific fallback applied.',
            pressure_forecast: weather?.pressureForecast || [],
            offline_mode: true,
            water_temp: scientificData?.waterTemp || null,
            water_temp_source: scientificData?.waterTempSource || 'offline',
            water_temp_station: scientificData?.waterTempStation || null,
            water_temp_station_distance: scientificData?.waterTempStationDistance || null
        };
    }

    async function generateFishingStrategy(params) {
        const { location, species, clarity, engine, isBoat, currentTime } = params;
        const weather = await weatherService.getWeatherData(location);
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
            { useLureCatalog: false, hour: currentHour }
        );
        const weatherContext = weather
            ? `CURRENT WEATHER: ${weather.temp}\u00b0F (feels like ${weather.feels_like}\u00b0F), ${weather.desc}, Wind: ${weather.wind.speed} mph ${getWindDirection(weather.wind.direction)}, Pressure: ${weather.pressure}mb, Humidity: ${weather.humidity}%, Visibility: ${weather.visibility ? weather.visibility + ' mi' : 'N/A'}`
            : "WEATHER DATA: Unavailable (use seasonal averages)";
        const scientificContext = scientificData
            ? `SCIENTIFIC ENGINE: Bite ${scientificData.biteProbability}% (${scientificData.biteRank}); Metabolic Efficiency ${scientificData.metabolicEfficiency}%; Pressure Trend ${scientificData.pressureTrend}; Recommended Strategy ${scientificData.strategyType}; Water Temp ${scientificData.waterTemp}\u00b0F (${scientificData.waterTempSource})`
            : 'SCIENTIFIC ENGINE: Unavailable';

        if (!genAI) return buildOfflineStrategy(params, weather, 'AI service unavailable');

        const model = genAI.getGenerativeModel({
            model: engine || 'gemini-3-flash-preview',
            generationConfig: { responseMimeType: "application/json" }
        });
        const prompt = buildGenerationPrompt({
            species, location, clarity, isBoat, currentTime,
            weatherContext, scientificContext,
            fishPatterns: fishPatterns.substring(0, 5000)
        });

        try {
            const result = await model.generateContent(prompt);
            const rawText = result.response.text();
            
            // Extract token usage from Gemini API response
            const usageMetadata = result.response.usageMetadata;
            let tokenRecord = null;
            if (usageMetadata) {
                tokenRecord = recordTokenUsage({
                    inputTokens: usageMetadata.promptTokenCount || 0,
                    outputTokens: usageMetadata.candidatesTokenCount || 0,
                    totalTokens: usageMetadata.totalTokenCount || 0,
                    model: engine || 'gemini-3-flash-preview',
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
            
            if (isDev) console.log('\n[Gemini raw response]\n', rawText, '\n');
            let responseJson;
            try { responseJson = JSON.parse(rawText); }
            catch (err) { throw new Error('AI response could not be parsed'); }

            // Engine-derived activity forecast (not LLM hallucination)
            const activity = scientificData
                ? deriveActivityForecast({
                    currentHour: new Date().getHours(),
                    pressureTrend: scientificData.pressureTrend || 'Unknown',
                    metabolicEfficiency: (scientificData.metabolicEfficiency || 50) / 100
                  })
                : generateDefaultActivity();
            const biteMetrics = scientificData
                ? { score: scientificData.biteProbability, rank: scientificData.biteRank, reasoning: scientificData.biteReasoning }
                : await biteEngine.calculateQuickBite(weather);

            return {
                generation_cost: tokenRecord ? tokenRecord.costUSD : 0,
                strategy: ensureString(responseJson.strategy) || 'No detailed AI strategy was returned.',
                safety: ensureString(responseJson.safety) || 'Always wear a life jacket and follow local regulations.',
                intel: ensureString(responseJson.intel) || 'Target obvious structure such as points, docks, and weed edges.',
                activity, weather,
                scientific_data: scientificData,
                recommended_lures: [],
                solunar: {
                    moon_phase: responseJson.solunar?.moon_phase || 'Unknown',
                    assessment: responseJson.solunar?.assessment || 'No assessment available',
                    note: 'Supplementary — not used in bite score calculation'
                },
                map_url: `https://www.google.com/maps/search/${encodeURIComponent(location)}`,
                bite_probability: biteMetrics.score,
                bite_rank: biteMetrics.rank,
                bite_reasoning: biteMetrics.reasoning,
                pressure_forecast: weather?.pressureForecast || [],
                water_temp: scientificData?.waterTemp || null,
                water_temp_source: scientificData?.waterTempSource || null,
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

module.exports = { createAIService, getTokenUsageReport, recordTokenUsage };

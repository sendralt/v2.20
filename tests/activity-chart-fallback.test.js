"use strict";

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

function loadAppScript() {
    const dom = new JSDOM(`<!doctype html><html><head></head><body>
        <div id="particles"></div>
        <div id="resultsSection" class="hidden"></div>
        <div id="toastContainer"></div>
        <div id="biteScore"></div>
        <div id="biteRank"></div>
        <div id="biteReasoning"></div>
        <div id="wxTemp"></div>
        <div id="wxWaterTemp"></div>
        <div id="wxWind"></div>
        <div id="wxPressure"></div>
        <div id="wxHumidity"></div>
        <div id="wxDesc"></div>
        <div id="strategyContent"></div>
        <div id="intelContent"></div>
        <div id="safetyContent"></div>
        <div id="forecastNote"></div>
        <a id="mapLink"></a>
        <div id="moonPhaseIcon"></div>
        <div id="moonPhaseText"></div>
        <div id="solunarAssessment"></div>
        <div id="bestTime"></div>
        <div style="height:220px;width:320px"><canvas id="activityChart"></canvas></div>
    </body></html>`, {
        url: 'https://fishsmart.test/',
        runScripts: 'outside-only'
    });

    const { window } = dom;
    const originalAddEventListener = window.document.addEventListener.bind(window.document);
    window.document.addEventListener = (type, listener, options) => {
        if (type === 'DOMContentLoaded') return;
        return originalAddEventListener(type, listener, options);
    };
    window.console = console;
    window.fetch = async () => ({ ok: true, async json() { return { success: true, data: [] }; } });
    window.DOMPurify = { sanitize(value) { return value; } };
    window.lucide = { createIcons() {} };
    window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
    window.navigator.vibrate = () => {};
    window.setTimeout = setTimeout;
    window.clearTimeout = clearTimeout;
    window.HTMLElement.prototype.scrollIntoView = function() {};
    window.HTMLElement.prototype.focus = function() {};

    const operations = [];
    const canvas = window.document.getElementById('activityChart');
    const ctx = {
        strokeStyle: '',
        fillStyle: '',
        font: '',
        textAlign: '',
        textBaseline: '',
        setTransform: (...args) => operations.push(['setTransform', ...args]),
        clearRect: (...args) => operations.push(['clearRect', ...args]),
        beginPath: (...args) => operations.push(['beginPath', ...args]),
        moveTo: (...args) => operations.push(['moveTo', ...args]),
        lineTo: (...args) => operations.push(['lineTo', ...args]),
        stroke: (...args) => operations.push(['stroke', ...args]),
        fillRect: (...args) => operations.push(['fillRect', ...args]),
        fillText: (...args) => operations.push(['fillText', ...args])
    };
    canvas.getContext = () => ctx;

    const parent = canvas.parentElement;
    Object.defineProperty(parent, 'clientWidth', { configurable: true, value: 320 });
    Object.defineProperty(parent, 'clientHeight', { configurable: true, value: 220 });

    const originalAppendChild = window.document.head.appendChild.bind(window.document.head);
    window.document.head.appendChild = (node) => {
        if (node.tagName === 'SCRIPT' && /chart\.umd\.min\.js/.test(node.src)) {
            setTimeout(() => node.onerror && node.onerror(new Error('blocked in privacy mode')), 0);
            return node;
        }
        return originalAppendChild(node);
    };

    const script = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app.js'), 'utf8');
    vm.runInContext(script, dom.getInternalVMContext());
    return { dom, window, operations };
}

describe('activity chart fallback', () => {
    it('renders the hourly chart even when Chart.js fails to load', async () => {
        const { dom, window, operations } = loadAppScript();

        await window.displayResults({
            bite_probability: 62,
            bite_rank: 'Good',
            bite_reasoning: 'Stable weather window.',
            strategy: 'Fish points with cover.',
            intel: 'Wind is favorable.',
            safety: 'Wear a life jacket.',
            forecast_note: 'Chart should still render without CDN access.',
            map_url: 'https://example.com/map',
            weather: { temp: 71, wind: { speed: 6 }, pressure: 1015, humidity: 40, desc: 'clear', cloudiness: 15 },
            solunar: { moon_phase: 'Full Moon', assessment: 'Active period.' },
            scientific_data: { pressureTrend: 'Stable' },
            water_temp: 67,
            activity: [3, 4, 5, 6, 7, 8, 7, 6, 5, 4, 3, 2]
        });

        assert.ok(operations.some(op => op[0] === 'fillRect'), 'expected fallback bars to be drawn');
        assert.match(window.document.getElementById('bestTime').textContent, / - /);

        dom.window.close();
    });
});

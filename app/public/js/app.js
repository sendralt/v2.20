/**
 * FishSmart Pro - Main Application JavaScript
 * 
 * Handles fishing intelligence UI, API interactions, charts, and user interactions.
 * Externalized from index.html for strict CSP compliance (no unsafe-inline).
 */

// ============================================
// INITIALIZATION
// ============================================

// Async font loader (CSP-safe: no inline event handlers)
(function() { 
    var f = document.getElementById('async-font'); 
    if (f) f.media = 'all'; 
})();

// Polling Lucide init (waits for deferred script)
// Add bounded retries to prevent an infinite timer loop if CDN load fails.
function initLucide(retries) {
    retries = retries || 120;
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
        return;
    }
    if (retries > 0) {
        setTimeout(function() { initLucide(retries - 1); }, 50);
    }
}
initLucide();

// ============================================
// PARTICLE EFFECTS
// ============================================

// Create floating particles
// Guard against missing container to avoid runtime errors if markup changes.
const particleContainer = document.getElementById('particles');
if (particleContainer && !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) {
    particleContainer.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 20; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.left = Math.random() * 100 + '%';
        particle.style.animationDelay = Math.random() * 8 + 's';
        particle.style.animationDuration = (6 + Math.random() * 4) + 's';
        particleContainer.appendChild(particle);
    }
}

// ============================================
// FOCUS TRAP UTILITY
// ============================================

var focusTrapStack = [];

function trapFocus(element) {
    if (!element) return function() {};
    var focusable = element.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    function handler(e) {
        if (e.key !== 'Tab') return;
        if (e.shiftKey) {
            if (document.activeElement === first) { e.preventDefault(); last.focus(); }
        } else {
            if (document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
    }
    element.addEventListener('keydown', handler);
    if (first) first.focus();
    var release = function() { element.removeEventListener('keydown', handler); };
    focusTrapStack.push(release);
    return release;
}

function releaseFocus() {
    var release = focusTrapStack.pop();
    if (release) release();
}

// ============================================
// TOAST NOTIFICATIONS
// ============================================

function showToast(message, type) {
    type = type || 'info';
    var container = document.getElementById('toastContainer');
    if (!container) return;
    container.setAttribute('role', 'status');
    container.setAttribute('aria-live', 'polite');
    var icons = { error: '\u26A0\uFE0F', success: '\u2705', warning: '\u26A0\uFE0F', info: '\u2139\uFE0F' };
    var toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    var iconSpan = document.createElement('span');
    iconSpan.textContent = icons[type] || '';
    var msgSpan = document.createElement('span');
    msgSpan.textContent = message;
    toast.appendChild(iconSpan);
    toast.appendChild(msgSpan);
    container.appendChild(toast);
    setTimeout(function() {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 4000);
}

window.showToast = showToast;

// ============================================
// UI INTERACTIONS
// ============================================

// Clarity buttons
document.querySelectorAll('.clarity-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
        document.querySelectorAll('.clarity-btn').forEach(function(b) {
            b.classList.remove('border-cyan-500', 'bg-cyan-500/20', 'text-cyan-400');
            b.classList.add('border-cyan-500/20', 'bg-slate-800/50', 'text-gray-400');
            b.setAttribute('aria-pressed', 'false');
        });
        this.classList.remove('border-cyan-500/20', 'bg-slate-800/50', 'text-gray-400');
        this.classList.add('border-cyan-500', 'bg-cyan-500/20', 'text-cyan-400');
        this.setAttribute('aria-pressed', 'true');
    });
});

// Ripple effect via event delegation with element reuse
var globalRipple = null;
document.body.addEventListener('click', function(e) {
    var button = e.target.closest('button');
    if (!button) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!globalRipple) {
        globalRipple = document.createElement('div');
        globalRipple.className = 'ripple-effect';
        globalRipple.setAttribute('aria-hidden', 'true');
    }
    if (globalRipple.parentNode) globalRipple.parentNode.removeChild(globalRipple);
    var rect = button.getBoundingClientRect();
    var size = Math.max(rect.width, rect.height);
    globalRipple.style.width = globalRipple.style.height = size + 'px';
    globalRipple.style.left = (e.clientX - rect.left - size/2) + 'px';
    globalRipple.style.top = (e.clientY - rect.top - size/2) + 'px';
    button.appendChild(globalRipple);
    setTimeout(function() {
        if (globalRipple && globalRipple.parentNode) globalRipple.parentNode.removeChild(globalRipple);
    }, 600);
});

// ============================================
// CHART INITIALIZATION
// ============================================

let activityChart = null;
let chartJsPromise = null;

function loadChartJs() {
    if (window.Chart) {
        return Promise.resolve(true);
    }

    if (chartJsPromise) {
        return chartJsPromise;
    }

    chartJsPromise = new Promise(function(resolve) {
        const s = document.createElement("script");
        s.src = "https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js";
        s.onload = function() { resolve(true); };
        s.onerror = function() {
            console.warn('Chart.js failed to load; using canvas fallback');
            resolve(false);
        };
        document.head.appendChild(s);
    });

    return chartJsPromise;
}

function getActivityLabels() {
    const labels = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
        const h = (now.getHours() + i) % 24;
        labels.push((h % 12 || 12) + (h >= 12 ? ' PM' : ' AM'));
    }
    return labels;
}

// ============================================
// ACTIVITY CHART RENDERING
// ============================================

function renderActivityChart(dataPoints) {
    const canvas = document.getElementById('activityChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (activityChart?.destroy) activityChart.destroy();

    const labels = getActivityLabels();

    // Convert 1-10 scale to 0-100
    var scaled = dataPoints.map(function(v) { return v * 10; });

    if (typeof window.Chart === 'undefined') {
        renderActivityChartFallback(canvas, ctx, labels, scaled);
        activityChart = null;
        return;
    }

    activityChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Activity',
                data: scaled,
                backgroundColor: '#4fd1c5',
                borderRadius: 4,
                maxBarThickness: 32
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(10,14,39,0.9)',
                    titleColor: '#4fd1c5',
                    bodyColor: '#fff',
                    borderColor: '#4fd1c5',
                    borderWidth: 1,
                    padding: 10,
                    displayColors: false,
                    callbacks: {
                        label: function(ctx) {
                            var v = ctx.raw;
                            var lvl = v >= 80 ? 'Excellent' : v >= 60 ? 'Good' : v >= 40 ? 'Moderate' : 'Low';
                            return 'Activity: ' + v + '/100 (' + lvl + ')';
                        }
                    }
                }
            },
            scales: {
                y: {
                    min: 0,
                    max: 100,
                    grid: { color: 'rgba(255,255,255,0.06)' },
                    ticks: { color: '#666', stepSize: 25 }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#666', maxRotation: 45 }
                }
            }
        }
    });
}

function renderActivityChartFallback(canvas, ctx, labels, scaled) {
    const parent = canvas.parentElement;
    const cssWidth = Math.max(parent?.clientWidth || canvas.clientWidth || 320, 320);
    const cssHeight = Math.max(parent?.clientHeight || canvas.clientHeight || 220, 220);
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.floor(cssWidth * ratio);
    canvas.height = Math.floor(cssHeight * ratio);
    if (typeof ctx.setTransform === 'function') {
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    }
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    const padding = { top: 12, right: 8, bottom: 42, left: 24 };
    const chartWidth = cssWidth - padding.left - padding.right;
    const chartHeight = cssHeight - padding.top - padding.bottom;
    const stepX = chartWidth / scaled.length;
    const barWidth = Math.max(10, stepX * 0.65);

    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.fillStyle = '#667085';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    [0, 25, 50, 75, 100].forEach(function(value) {
        const y = padding.top + chartHeight - (chartHeight * value / 100);
        if (typeof ctx.beginPath === 'function') ctx.beginPath();
        if (typeof ctx.moveTo === 'function') ctx.moveTo(padding.left, y);
        if (typeof ctx.lineTo === 'function') ctx.lineTo(cssWidth - padding.right, y);
        if (typeof ctx.stroke === 'function') ctx.stroke();
        if (typeof ctx.fillText === 'function') ctx.fillText(String(value), padding.left - 4, y);
    });

    ctx.fillStyle = '#4fd1c5';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    scaled.forEach(function(value, index) {
        const x = padding.left + (stepX * index) + ((stepX - barWidth) / 2);
        const barHeight = chartHeight * Math.max(0, Math.min(100, value)) / 100;
        const y = padding.top + chartHeight - barHeight;
        if (typeof ctx.fillRect === 'function') ctx.fillRect(x, y, barWidth, barHeight);
        if (typeof ctx.fillText === 'function') ctx.fillText(labels[index], x + (barWidth / 2), cssHeight - padding.bottom + 8);
    });
}

// ============================================
// BEST WINDOW & CONDITIONS
// ============================================

function findBestWindow(dataPoints) {
    var labels = getActivityLabels();
    var bestIndex = 0;
    var max = 0;
    for (var i = 0; i < dataPoints.length - 2; i++) {
        var sum = dataPoints[i] + dataPoints[i + 1] + dataPoints[i + 2];
        if (sum > max) {
            max = sum;
            bestIndex = i;
        }
    }
    return labels[bestIndex] + ' - ' + labels[bestIndex + 2];
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function formatMarkdown(text) {
    if (!text) return '--';
    var safe = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    var BULLET_PLACEHOLDER = '\x00BULLET\x00';
    safe = safe.replace(/(^|\n)\* /g, '$1' + BULLET_PLACEHOLDER);
    safe = safe.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    safe = safe.replace(/\*(.*?)\*/g, '<em>$1</em>');
    safe = safe.replace(new RegExp(BULLET_PLACEHOLDER, 'g'), '* ');
    safe = safe.replace(/\n/g, '<br>');
    return safe;
}

function getMoonEmoji(phase) {
    if (!phase) return '🌕';
    const p = phase.toLowerCase();
    if (p.includes('new'))              return '🌑';
    if (p.includes('waxing crescent'))  return '🌒';
    if (p.includes('first quarter'))    return '🌓';
    if (p.includes('waxing gibbous'))   return '🌔';
    if (p.includes('full'))             return '🌕';
    if (p.includes('waning gibbous'))   return '🌖';
    if (p.includes('last quarter') || p.includes('third quarter')) return '🌗';
    if (p.includes('waning crescent'))  return '🌘';
    return '🌕';
}

// ============================================
// DISPLAY RESULTS
// ============================================

async function displayResults(data) {
    const section = document.getElementById('resultsSection');
    section.classList.remove('hidden');
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    section.setAttribute('tabindex', '-1');
    section.setAttribute('aria-label', 'Forecast results loaded');
    section.focus({ preventScroll: true });

    // Re-init lucide for new icons in results section
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    // Bite score
    document.getElementById('biteScore').textContent = (data.bite_probability ?? '--') + '%';
    document.getElementById('biteRank').textContent = data.bite_rank || '--';
    document.getElementById('biteReasoning').textContent = data.bite_reasoning || '';

    // Weather
    if (data.weather) {
        const pressureInHg = data.weather.pressure ? (data.weather.pressure * 0.029529983071445).toFixed(2) : '--';
        document.getElementById('wxTemp').textContent = data.weather.temp + '°F';
        document.getElementById('wxWaterTemp').textContent = data.water_temp ? data.water_temp + '°F' : '--';
        document.getElementById('wxWind').textContent = (data.weather.wind && data.weather.wind.speed) ? data.weather.wind.speed + ' mph' : '--';
        document.getElementById('wxPressure').textContent = pressureInHg;
        document.getElementById('wxHumidity').textContent = data.weather.humidity + '%';
        document.getElementById('wxDesc').textContent = data.weather.desc || '';
        var waterSourceEl = document.getElementById('wxWaterSource');
        var waterStationEl = document.getElementById('wxWaterStation');
        if (waterSourceEl) {
            var sourceLabel = data.water_temp_source || data.weather.locationSource || '';
            waterSourceEl.textContent = sourceLabel ? 'Water temp source: ' + sourceLabel : '--';
        }
        if (waterStationEl) {
            var stationLabel = data.water_temp_station
                ? 'USGS station: ' + data.water_temp_station + (data.water_temp_station_distance ? ' (' + Math.round(data.water_temp_station_distance) + ' mi away)' : '')
                : '';
            if (stationLabel) {
                waterStationEl.textContent = stationLabel;
                waterStationEl.classList.remove('hidden');
            } else {
                waterStationEl.textContent = '';
                waterStationEl.classList.add('hidden');
            }
        }
    }
    else {
        var waterSourceFallback = document.getElementById('wxWaterSource');
        var waterStationFallback = document.getElementById('wxWaterStation');
        if (waterSourceFallback) waterSourceFallback.textContent = '--';
        if (waterStationFallback) {
            waterStationFallback.textContent = '';
            waterStationFallback.classList.add('hidden');
        }
    }

    // Strategy / Intel / Safety
    document.getElementById('strategyContent').innerHTML = DOMPurify.sanitize(formatMarkdown(data.strategy));
    document.getElementById('intelContent').innerHTML = DOMPurify.sanitize(formatMarkdown(data.intel));
    document.getElementById('safetyContent').innerHTML = DOMPurify.sanitize(formatMarkdown(data.safety));
    document.getElementById('forecastNote').innerHTML = DOMPurify.sanitize(formatMarkdown(data.forecast_note));

    // Map link
    if (data.map_url) document.getElementById('mapLink').href = data.map_url;

    // Solunar
    if (data.solunar) {
        document.getElementById('moonPhaseIcon').textContent = getMoonEmoji(data.solunar.moon_phase);
        document.getElementById('moonPhaseText').textContent = data.solunar.moon_phase;
        document.getElementById('solunarAssessment').textContent = data.solunar.assessment;
    }

    // Activity chart
    if (data.activity && Array.isArray(data.activity)) {
        try {
            await loadChartJs();
            renderActivityChart(data.activity);
        } catch (err) {
            console.error('Failed to load chart:', err);
            renderActivityChart(data.activity);
        }
    }

    // Best time window
    var bestTimeEl = document.getElementById('bestTime');
    if (bestTimeEl && data.activity && data.activity.length >= 3) {
        bestTimeEl.textContent = findBestWindow(data.activity);
    }
}

// ============================================
// GENERATE BUTTON - MAIN API HANDLER
// ============================================

function initGenerateButton() {
    const generateBtn = document.getElementById('generateBtn');
    if (!generateBtn) return;
    let abortController = null;
    
    generateBtn.addEventListener('click', async function() {
        // Check subscription status first
        if (typeof window.subscription !== 'undefined') {
            const canGenerate = window.subscription.checkUsage();
            if (!canGenerate) return;
        }
        
        const locationInput = document.getElementById('waterBody');
        const speciesInput = document.getElementById('speciesSelect');
        const clarityBtn = document.querySelector('.clarity-btn.border-cyan-500');
        const boatCheckbox = document.querySelector('input[type="checkbox"]');
        
        const location = locationInput ? locationInput.value.trim() : '';
        const species = speciesInput ? speciesInput.value : '';
        const clarity = clarityBtn ? clarityBtn.dataset.clarity : 'Clear';
        const isBoat = boatCheckbox ? boatCheckbox.checked : false;

        // Inline validation
        var hasError = false;
        var waterBodyError = document.getElementById('waterBodyError');
        var speciesError = document.getElementById('speciesError');

        // Clear previous errors
        if (waterBodyError) { waterBodyError.classList.add('hidden'); waterBodyError.textContent = ''; }
        if (speciesError) { speciesError.classList.add('hidden'); speciesError.textContent = ''; }
        if (locationInput) locationInput.classList.remove('input-error');
        if (speciesInput) speciesInput.classList.remove('input-error');

        if (!location) {
            hasError = true;
            locationInput.classList.add('input-error');
            if (waterBodyError) {
                waterBodyError.textContent = '⚠ Please enter a body of water';
                waterBodyError.classList.remove('hidden');
            }
        }
        if (!species) {
            hasError = true;
            speciesInput.classList.add('input-error');
            if (speciesError) {
                speciesError.textContent = '⚠ Please select a target species';
                speciesError.classList.remove('hidden');
            }
        }
        if (hasError) return;

        // Persist form state to localStorage
        try {
            localStorage.setItem('fishsmart_form', JSON.stringify({
                location: location,
                species: species,
                clarity: clarity,
                isBoat: isBoat
            }));
        } catch(e) {}


        abortController = new AbortController();
        window._activeAbortController = abortController;
        generateBtn.disabled = true;

        const overlay = document.getElementById('loadingOverlay');
        const loadingText = document.getElementById('loadingText');
        if (overlay) {
            overlay.classList.remove('hidden');
            overlay.classList.add('flex');
            overlay.classList.remove('fade-out');
        }

        const loadingTexts = [
            'Connecting to AI engine...', 'Processing satellite data...',
            'Analyzing barometric pressure...', 'Calculating solunar periods...',
            'Evaluating feeding patterns...', 'Optimizing lure selection...',
            'Finalizing strategy...'
        ];
        let ti = 0;
        const textInterval = setInterval(function() {
            if (loadingText) {
                loadingText.textContent = loadingTexts[ti % loadingTexts.length];
                ti++;
            }
        }, 900);

        try {
            const deviceId = localStorage.getItem('fishsmart_device_id') || 'unknown';
            const authHeaders = typeof window.subscription !== 'undefined'
                ? window.subscription.getAuthHeaders()
                : { 'X-Device-ID': deviceId };
            const response = await fetch('/api/generate', {
                method: 'POST',
                signal: abortController.signal,
                headers: {
                    'Content-Type': 'application/json',
                    ...authHeaders,
                    'X-Device-ID': authHeaders['X-Device-ID'] || deviceId
                },
                body: JSON.stringify({
                    deviceId: deviceId,
                    location: location,
                    species: species,
                    clarity: clarity,
                    engine: 'gemini-3-flash-preview',
                    isBoat: isBoat,
                    currentTime: new Date().toLocaleString()
                })
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(function() { return {}; });
                var isSubscriptionError =
                        errorData.code === 'SUBSCRIPTION_REQUIRED' ||
                        errorData.code === 'FREE_TIER_EXHAUSTED' ||
                        errorData.code === 'SUBSCRIPTION_EXPIRED' ||
                        (response.status === 401 && errorData.error && errorData.error.toLowerCase().indexOf('limit') !== -1);
                if (isSubscriptionError) {
                    if (typeof window.subscription !== 'undefined') {
                        window.subscription.showPaywall();
                    }
                    throw new Error('Please subscribe to continue');
                }
                throw new Error(errorData.error || 'Server returned ' + response.status);
            }
            
            const result = await response.json().catch(function() {
                return { success: false, error: 'Unexpected response from server. Please try again.' };
            });
            if (!result.success) throw new Error(result.error || 'Unknown error');
            
            // Update usage after successful request
            if (typeof window.subscription !== 'undefined') {
                window.subscription.fetchUsageStats();
            }

            clearInterval(textInterval);
            if (loadingText) loadingText.textContent = 'Analysis complete!';
            
            displayResults(result.data);

            setTimeout(function() { 
                if (overlay) {
                    overlay.classList.add('hidden'); 
                    overlay.classList.remove('flex'); 
                }
                generateBtn.disabled = false;
            }, 800);
            
        } catch (err) {
            clearInterval(textInterval);

            // Handle user-initiated cancel silently
            if (err && err.name === 'AbortError') {
                window._activeAbortController = null;
                if (overlay) { overlay.classList.add('hidden'); overlay.classList.remove('flex', 'fade-out'); }
                generateBtn.disabled = false;
                return;
            }

            var isNetworkIssue = err && err.message && (
                err.message.toLowerCase().indexOf('offline') !== -1 ||
                err.message.toLowerCase().indexOf('service temporarily unavailable') !== -1
            );
            if (!isNetworkIssue) console.error('API Error:', err);
            if (loadingText) loadingText.textContent = (isNetworkIssue ? '📡 ' : '⚠ ') + err.message;
            showToast(err.message || 'Something went wrong', isNetworkIssue ? 'info' : 'error');
            setTimeout(function() { 
                if (overlay) {
                    overlay.classList.add('hidden'); 
                    overlay.classList.remove('flex', 'fade-out'); 
                }
            }, 2500);
            window._activeAbortController = null;
            generateBtn.disabled = false;
        }
    });
}

// ============================================
// LOADING ANIMATION
// ============================================

// Add loading keyframes dynamically
(function() {
    const style = document.createElement('style');
    style.textContent = `
        @keyframes loading {
            0% { width: 0%; }
            50% { width: 70%; }
            100% { width: 100%; }
        }
    `;
    document.head.appendChild(style);
})();

// ============================================
// TOUCH & HAPTIC FEEDBACK
// ============================================

// Prevent zoom on double tap (skip form elements)
let lastTouchEnd = 0;
document.addEventListener('touchend', function(e) {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) {
        var target = e.target;
        var isForm = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable || target.closest('input, textarea, select, [contenteditable]');
        if (!isForm) {
            e.preventDefault();
        }
    }
    lastTouchEnd = now;
}, false);

// Add haptic feedback simulation via event delegation
document.body.addEventListener('click', function(e) {
    var el = e.target.closest('button, select');
    if (!el) return;
    if (navigator.vibrate) {
        navigator.vibrate(10);
    }
});

// ============================================
// FORECAST HISTORY
// ============================================

function initHistoryPanel() {
    var panel = document.getElementById('historyPanel');
    var list = document.getElementById('historyList');
    var navBtn = document.getElementById('historyNavBtn');
    var closeBtn = document.getElementById('historyCloseBtn');
    var exportJsonBtn = document.getElementById('exportJsonBtn');
    var exportCsvBtn = document.getElementById('exportCsvBtn');
    var clearBtn = document.getElementById('clearHistoryBtn');
    if (!panel || !navBtn) return;

    function showPanel() {
        panel.classList.remove('hidden');
        panel.classList.add('flex');
        loadHistory();
        if (typeof lucide !== 'undefined') lucide.createIcons();
        trapFocus(panel);
        document.addEventListener('keydown', function historyEsc(e) {
            if (e.key === 'Escape') {
                hidePanel();
                document.removeEventListener('keydown', historyEsc);
            }
        });
    }
    function hidePanel() {
        panel.classList.add('hidden');
        panel.classList.remove('flex');
        releaseFocus();
    }

    navBtn.addEventListener('click', showPanel);
    closeBtn.addEventListener('click', hidePanel);

    if (list) {
        list.addEventListener('click', function(e) {
            var delBtn = e.target.closest('.delete-forecast-btn');
            if (delBtn) {
                e.stopPropagation();
                deleteForecast(delBtn.dataset.id);
                return;
            }
            var card = e.target.closest('[data-id]');
            if (card) {
                viewForecast(card.dataset.id);
            }
        });
    }

    function getAuthHeaders() {
        // H-2: Use shared AuthUtils module
        if (typeof window.AuthUtils !== 'undefined') {
            return window.AuthUtils.getAuthHeaders();
        }
        // Fallback if auth-utils.js failed to load
        if (typeof window.subscription !== 'undefined') {
            return window.subscription.getAuthHeaders();
        }
        var deviceId = localStorage.getItem('fishsmart_device_id') || 'unknown';
        return { 'X-Device-ID': deviceId };
    }

    async function loadHistory() {
        if (!list) return;
        list.innerHTML = DOMPurify.sanitize('<p class="text-sm text-gray-500 text-center py-8">Loading history...</p>');
        try {
            var headers = getAuthHeaders();
            headers['X-Device-ID'] = headers['X-Device-ID'] || localStorage.getItem('fishsmart_device_id') || 'unknown';
            var resp = await fetch('/api/history', { headers: headers });
            var json = await resp.json();
            if (!json.success || !json.data || json.data.length === 0) {
                list.innerHTML = DOMPurify.sanitize('<p class="text-sm text-gray-500 text-center py-8">No forecasts yet. Generate your first forecast to see it here.</p>');
                return;
            }
            list.innerHTML = '';
            json.data.forEach(function(f) {
                var date = new Date(f.created_at);
                var timeStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
                var rankColor = f.bite_rank === 'Excellent' ? 'text-green-400' : f.bite_rank === 'Very Good' ? 'text-cyan-400' : f.bite_rank === 'Good' ? 'text-yellow-400' : 'text-gray-400';
                var itemHtml = '<div class="flex items-center justify-between mb-2">' +
                        '<div class="flex items-center gap-2">' +
                            '<span class="text-lg font-bold ' + rankColor + '">' + (f.bite_probability ?? '--') + '%</span>' +
                            '<span class="text-xs px-2 py-0.5 rounded bg-slate-800 text-gray-400">' + (f.bite_rank || '--') + '</span>' +
                        '</div>' +
                        '<button class="delete-forecast-btn text-gray-600 hover:text-red-400 transition-colors p-1" data-id="' + f.id + '">' +
                            '<i data-lucide="trash-2" class="w-4 h-4"></i>' +
                        '</button>' +
                    '</div>' +
                    '<div class="text-sm text-white font-medium truncate">' + (f.location || 'Unknown') + '</div>' +
                    '<div class="flex items-center gap-2 mt-1 text-xs text-gray-500">' +
                        '<span>' + (f.species || '') + '</span>' +
                        '<span>·</span>' +
                        '<span>' + timeStr + '</span>' +
                    '</div>';
                var card = document.createElement('div');
                card.className = 'glass-panel rounded-xl p-4 border border-slate-700/50 cursor-pointer hover:border-cyan-500/30 transition-colors';
                card.setAttribute('data-id', f.id);
                card.innerHTML = DOMPurify.sanitize(itemHtml);
                list.appendChild(card);
            });

            if (typeof lucide !== 'undefined') lucide.createIcons();
        } catch (err) {
            list.innerHTML = DOMPurify.sanitize('<p class="text-sm text-red-400 text-center py-8">Failed to load history.</p>');
        }
    }

    async function viewForecast(id) {
        try {
            var headers = getAuthHeaders();
            headers['X-Device-ID'] = headers['X-Device-ID'] || localStorage.getItem('fishsmart_device_id') || 'unknown';
            var resp = await fetch('/api/history/' + id, { headers: headers });
            var json = await resp.json();
            if (!json.success) return;
            var result = typeof json.data.result === 'string' ? JSON.parse(json.data.result) : json.data.result;
            if (result) {
                hidePanel();
                displayResults(result);
            }
        } catch (err) {
            console.error('View forecast error:', err);
        }
    }

    async function deleteForecast(id) {
        try {
            var headers = getAuthHeaders();
            headers['X-Device-ID'] = headers['X-Device-ID'] || localStorage.getItem('fishsmart_device_id') || 'unknown';
            await fetch('/api/history/' + id, { method: 'DELETE', headers: headers });
            loadHistory();
        } catch (err) {
            console.error('Delete forecast error:', err);
        }
    }

    async function exportHistory(format) {
        try {
            var headers = getAuthHeaders();
            headers['X-Device-ID'] = headers['X-Device-ID'] || localStorage.getItem('fishsmart_device_id') || 'unknown';
            var resp = await fetch('/api/history/export?format=' + format, { headers: headers });
            if (!resp.ok) throw new Error('Export failed');
            var blob = await resp.blob();
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = 'fishsmart-forecasts.' + format;
            document.body.appendChild(a);
            try {
                a.click();
            } finally {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }
        } catch (err) {
            console.error('Export error:', err);
        }
    }

    if (exportJsonBtn) exportJsonBtn.addEventListener('click', function() { exportHistory('json'); });
    if (exportCsvBtn) exportCsvBtn.addEventListener('click', function() { exportHistory('csv'); });
    if (clearBtn) clearBtn.addEventListener('click', async function() {
        var originalText = clearBtn.textContent || 'Clear';
        if (clearBtn.dataset.confirm !== 'true') {
            clearBtn.dataset.confirm = 'true';
            clearBtn.textContent = 'Tap again to confirm';
            setTimeout(function() {
                if (clearBtn.dataset.confirm === 'true') {
                    clearBtn.dataset.confirm = 'false';
                    clearBtn.textContent = originalText;
                }
            }, 3000);
            return;
        }
        clearBtn.dataset.confirm = 'false';
        clearBtn.textContent = originalText;
        try {
            var headers = getAuthHeaders();
            headers['X-Device-ID'] = headers['X-Device-ID'] || localStorage.getItem('fishsmart_device_id') || 'unknown';
            await fetch('/api/history', { method: 'DELETE', headers: headers });
            loadHistory();
        } catch (err) {
            console.error('Clear history error:', err);
        }
    });
}

function initWelcomeScreen() {
    const hasSeenWelcome = localStorage.getItem('fishsmart_welcome_seen');
    const welcomeScreen = document.getElementById('welcomeScreen');
    const startFishingBtn = document.getElementById('startFishingBtn');

    if (welcomeScreen && startFishingBtn) {
        if (hasSeenWelcome) {
            welcomeScreen.classList.add('hidden');
            welcomeScreen.classList.remove('flex');
        } else {
            welcomeScreen.classList.remove('hidden');
            welcomeScreen.classList.add('flex');
            trapFocus(welcomeScreen);
            startFishingBtn.focus();

                releaseFocus();
            startFishingBtn.addEventListener('click', function() {
                welcomeScreen.classList.add('hidden');
                welcomeScreen.classList.remove('flex');
                localStorage.setItem('fishsmart_welcome_seen', 'true');
            });
        }
    }
}

// ============================================
// CANCEL BUTTON WIRING
// ============================================

(function() {
    var cancelBtn = document.getElementById('cancelGenerateBtn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', function() {
            if (window._activeAbortController) {
                window._activeAbortController.abort();
            }
        });
    }
})();

// ============================================
// FREE TIER INDICATOR (T22)
// ============================================

function updateFreeTierIndicator() {
    var indicator = document.getElementById('freeTierIndicator');
    if (!indicator) return;
    if (typeof window.subscription === 'undefined') return;
    var data = window.subscription.getUsageData();
    if (!data) return;

    if (data.isSubscribed) {
        indicator.classList.add('hidden');
    } else {
        var remaining = data.remaining ?? 3;
        if (remaining > 0) {
            indicator.textContent = remaining + ' free remaining';
            indicator.className = 'text-xs text-gray-500 font-medium';
            indicator.classList.remove('hidden', 'cursor-pointer');
        } else {
            indicator.textContent = 'Upgrade for unlimited';
            indicator.className = 'text-xs text-cyan-400 font-medium cursor-pointer hover:text-cyan-300 transition-colors';
            indicator.classList.remove('hidden');
            indicator.onclick = function() {
                if (typeof window.subscription !== 'undefined') window.subscription.showPaywall();
            };
        }
    }
}
window.updateFreeTierIndicator = updateFreeTierIndicator;

// ============================================
// INITIALIZE ON DOM READY
// ============================================
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        initGenerateButton();
        initWelcomeScreen();
        initHistoryPanel();
        restoreFormState();
    });
} else {
    initGenerateButton();
    initWelcomeScreen();
    initHistoryPanel();
    restoreFormState();
}

function restoreFormState() {
    try {
        var saved = JSON.parse(localStorage.getItem('fishsmart_form'));
        if (!saved) return;
        var loc = document.getElementById('waterBody');
        var spec = document.getElementById('speciesSelect');
        if (loc && saved.location) loc.value = saved.location;
        if (spec && saved.species) spec.value = saved.species;
        if (saved.clarity) {
            document.querySelectorAll('.clarity-btn').forEach(function(b) {
                b.setAttribute('aria-pressed', 'false');
                b.classList.remove('border-cyan-500', 'bg-cyan-500/20', 'text-cyan-400');
                b.classList.add('border-cyan-500/20', 'bg-slate-800/50', 'text-gray-400');
                if (b.dataset.clarity === saved.clarity) {
                    b.classList.remove('border-cyan-500/20', 'bg-slate-800/50', 'text-gray-400');
                    b.classList.add('border-cyan-500', 'bg-cyan-500/20', 'text-cyan-400');
                    b.setAttribute('aria-pressed', 'true');
                }
            });
        }
        var boat = document.getElementById('boatMode');
        if (boat && saved.isBoat) boat.checked = true;
    } catch(e) {}
}

// ============================================
// SERVICE WORKER REGISTRATION (PWA Support)
// ============================================

if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
        navigator.serviceWorker.register('/sw.js')
            .then(function(reg) {
                console.log('🚀 FishSmart Pro SW Registered:', reg.scope);
                reg.onupdatefound = function() {
                    const installingWorker = reg.installing;
                    installingWorker.onstatechange = function() {
                        if (installingWorker.state === 'installed') {
                            if (navigator.serviceWorker.controller) {
                                console.log('✨ New content available; please refresh.');
                            } else {
                                console.log('🛰️ Content cached for offline use.');
                            }
                        }
                    };
                };
            })
            .catch(function(err) {
                console.error('❌ SW failed:', err);
            });
    });
}

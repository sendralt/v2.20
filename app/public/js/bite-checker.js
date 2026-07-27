/**
 * FishSmart Pro — Bite Score Checker (Free SEO Tool)
 *
 * Standalone JS for the /bite-checker page.
 * Handles form submission, renders lite score + CTA.
 */

(function () {
    'use strict';

    var checkBtn = document.getElementById('bcCheckBtn');
    var locationInput = document.getElementById('bcLocation');
    var speciesSelect = document.getElementById('bcSpecies');
    var resultsDiv = document.getElementById('bcResults');
    var locationError = document.getElementById('bcLocationError');
    var speciesError = document.getElementById('bcSpeciesError');

    // FAQ accordion
    var faqQuestions = document.querySelectorAll('.faq-question');
    faqQuestions.forEach(function (q) {
        q.addEventListener('click', function () {
            q.classList.toggle('active');
        });
    });

    function getScoreColor(score) {
        if (score >= 75) return '#4ade80';
        if (score >= 55) return '#38bdf8';
        if (score >= 35) return '#facc15';
        return '#94a3b8';
    }

    function getScoreLabel(score) {
        if (score >= 75) return 'Excellent Bite';
        if (score >= 55) return 'Good Bite';
        if (score >= 35) return 'Moderate Bite';
        return 'Tough Bite';
    }

    function getScoreClass(score) {
        if (score >= 75) return 'score-excellent';
        if (score >= 55) return 'score-good';
        if (score >= 35) return 'score-moderate';
        return 'score-tough';
    }

    function showLoading() {
        resultsDiv.classList.remove('hidden');
        resultsDiv.innerHTML =
            '<div class="glass-panel rounded-2xl p-8 text-center animate-fadeInUp">' +
                '<div class="inline-block animate-spin rounded-full h-10 w-10 border-4 border-cyan-500/20 border-t-cyan-400"></div>' +
                '<p class="mt-4 text-gray-400">Analyzing conditions...</p>' +
            '</div>';
        resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function showError(msg) {
        resultsDiv.classList.remove('hidden');
        resultsDiv.innerHTML =
            '<div class="glass-panel rounded-2xl p-6 text-center border border-red-500/20 animate-fadeInUp">' +
                '<div class="text-3xl mb-2">⚠️</div>' +
                '<p class="text-red-400">' + escapeHtml(msg) + '</p>' +
                '<button type="button" id="bcRetryBtn" class="mt-4 text-cyan-400 hover:text-cyan-300 underline transition-colors">Try again</button>' +
            '</div>';
        var retryBtn = document.getElementById('bcRetryBtn');
        if (retryBtn) retryBtn.addEventListener('click', checkBiteScore);
    }

    function escapeHtml(str) {
        var div = document.createElement('div');
        div.textContent = str || '';
        return div.innerHTML;
    }

    function renderResults(data) {
        var score = Math.round(data.bite_score || 0);
        var deg = (score / 100) * 360;
        var color = getScoreColor(score);
        var label = getScoreLabel(score);
        var scoreClass = getScoreClass(score);
        var factor = data.top_factor ? escapeHtml(String(data.top_factor)) : 'Environmental conditions analyzed by scientific engine';
        var species = data.species ? escapeHtml(data.species) : 'your target species';
        var location = data.location ? escapeHtml(data.location) : 'your location';
        var waterTemp = data.water_temp ? Math.round(data.water_temp) + '°F' : null;
        var airTemp = data.temp ? Math.round(data.temp) + '°F' : null;

        var condsHtml = '';
        if (waterTemp || airTemp) {
            condsHtml = '<div class="flex justify-center gap-6 mt-4">';
            if (waterTemp) condsHtml += '<div class="text-center"><div class="text-xs text-gray-500 uppercase tracking-wide">Water Temp</div><div class="text-lg font-bold text-white">' + waterTemp + '</div></div>';
            if (airTemp) condsHtml += '<div class="text-center"><div class="text-xs text-gray-500 uppercase tracking-wide">Air Temp</div><div class="text-lg font-bold text-white">' + airTemp + '</div></div>';
            condsHtml += '</div>';
        }

        resultsDiv.classList.remove('hidden');
        resultsDiv.innerHTML =
            '<div class="glass-panel rounded-2xl p-6 md:p-8 animate-fadeInUp">' +
                '<div class="text-center">' +
                    '<h2 class="text-xl font-bold text-white mb-1">' + species + ' at ' + location + '</h2>' +
                    '<p class="text-sm text-gray-500 mb-6">Bite Score</p>' +
                    '<div class="bite-score-ring mx-auto ' + scoreClass + '" style="--deg:' + deg + 'deg">' +
                        '<div class="w-[164px] h-[164px] rounded-full bg-slate-950 flex items-center justify-center flex-col">' +
                            '<span class="text-5xl font-extrabold" style="color:' + color + '">' + score + '</span>' +
                            '<span class="text-xs text-gray-500">/ 100</span>' +
                        '</div>' +
                    '</div>' +
                    '<p class="text-xl font-bold mt-4" style="color:' + color + '">' + label + '</p>' +
                    condsHtml +
                '</div>' +
                '<div class="mt-6 pt-6 border-t border-white/5">' +
                    '<p class="text-xs text-cyan-400 font-semibold uppercase tracking-wide mb-2">Top Factor</p>' +
                    '<p class="text-sm text-gray-300">' + factor + '</p>' +
                '</div>' +
                '<div class="mt-6 glass-panel rounded-xl p-4 border border-cyan-500/20">' +
                    '<p class="text-sm text-gray-300 text-center">' +
                        'Want the full breakdown? <strong class="text-cyan-400">AI lure picks</strong>, <strong class="text-cyan-400">12-hour activity forecast</strong>, and <strong class="text-cyan-400">complete strategy</strong>?' +
                    '</p>' +
                    '<a href="/" class="btn-primary block text-center mt-4 py-3 rounded-xl font-bold text-slate-900 hover:opacity-90 transition-all">' +
                        'Try FishSmart Pro Free →' +
                    '</a>' +
                    '<p class="text-center text-xs text-gray-500 mt-2">3 free forecasts • No credit card</p>' +
                '</div>' +
            '</div>';

        resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    async function checkBiteScore() {
        var location = locationInput.value.trim();
        var species = speciesSelect.value;
        var hasError = false;

        locationError.classList.add('hidden');
        speciesError.classList.add('hidden');
        locationInput.classList.remove('border-red-500');
        speciesSelect.classList.remove('border-red-500');

        if (!location) {
            locationError.textContent = '⚠ Please enter a body of water';
            locationError.classList.remove('hidden');
            locationInput.classList.add('border-red-500');
            hasError = true;
        }
        if (!species) {
            speciesError.textContent = '⚠ Please select a species';
            speciesError.classList.remove('hidden');
            speciesSelect.classList.add('border-red-500');
            hasError = true;
        }
        if (hasError) return;

        checkBtn.disabled = true;
        checkBtn.textContent = 'Checking...';
        showLoading();

        try {
            var response = await fetch('/api/bite-checker', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ location: location, species: species })
            });

            if (response.status === 429) {
                showError('Too many checks. Please wait a minute and try again.');
                return;
            }

            var result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result.error || 'Unable to generate bite score');
            }

            renderResults(result.data);
        } catch (err) {
            showError(err.message || 'Something went wrong. Please try again.');
        } finally {
            checkBtn.disabled = false;
            checkBtn.textContent = 'Check Bite Score';
        }
    }

    checkBtn.addEventListener('click', checkBiteScore);

    // Allow Enter key to submit
    locationInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            checkBiteScore();
        }
    });
    speciesSelect.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            checkBiteScore();
        }
    });
})();

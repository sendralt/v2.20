/**
 * FishSmart Pro — Shareable Forecast Card Generator
 *
 * Renders a 1080×1350 (Instagram portrait) image from forecast data
 * using Canvas API. Exports as downloadable PNG via blob URL.
 *
 * No external dependencies. CSP-safe (self-hosted script, blob: images).
 */
(function (global) {
    'use strict';

    // Card dimensions (Instagram portrait — optimal for social sharing)
    var W = 1080;
    var H = 1350;

    // Color palette (matches app theme)
    var COLORS = {
        bgTop: '#0a0e27',
        bgMid: '#1e293b',
        bgBot: '#0c4a6e',
        panel: 'rgba(15, 23, 42, 0.8)',
        panelBorder: 'rgba(6, 182, 212, 0.25)',
        cyan: '#22d3ee',
        cyanBright: '#00f3ff',
        greenNeon: '#39ff14',
        teal: '#2dd4bf',
        purple: '#c084fc',
        yellow: '#facc15',
        white: '#f3f4f6',
        grayLight: '#d1d5db',
        grayMid: '#9ca3af',
        grayDark: '#6b7280',
        grayPanel: 'rgba(30, 41, 59, 0.6)',
    };

    // Bite score color thresholds
    function scoreColor(score) {
        if (score >= 75) return COLORS.greenNeon;
        if (score >= 55) return COLORS.teal;
        if (score >= 35) return COLORS.yellow;
        return COLORS.grayMid;
    }

    function scoreLabel(score) {
        if (score >= 75) return 'EXCELLENT BITE';
        if (score >= 55) return 'GOOD BITE';
        if (score >= 35) return 'MODERATE BITE';
        return 'TOUGH BITE';
    }

    // Truncate text to fit width
    function truncate(ctx, text, maxWidth) {
        if (ctx.measureText(text).width <= maxWidth) return text;
        var ellipsis = '...';
        var truncated = text;
        while (truncated.length > 0 && ctx.measureText(truncated + ellipsis).width > maxWidth) {
            truncated = truncated.slice(0, -1);
        }
        return truncated + ellipsis;
    }

    // Wrap text into lines that fit maxWidth
    function wrapText(ctx, text, maxWidth, maxLines) {
        var words = text.split(/\s+/);
        var lines = [];
        var current = '';
        for (var i = 0; i < words.length; i++) {
            var test = current ? current + ' ' + words[i] : words[i];
            if (ctx.measureText(test).width <= maxWidth) {
                current = test;
            } else {
                if (current) lines.push(current);
                current = words[i];
                if (lines.length >= maxLines - 1) break;
            }
        }
        if (current) lines.push(current);
        // Truncate last line if needed
        if (lines.length === maxLines) {
            lines[maxLines - 1] = truncate(ctx, lines[maxLines - 1], maxWidth);
        } else if (lines.length > maxLines) {
            lines = lines.slice(0, maxLines);
            lines[maxLines - 1] = truncate(ctx, lines[maxLines - 1], maxWidth);
        }
        return lines;
    }

    // Extract top factors from bite_reasoning text
    function extractFactors(reasoning, maxFactors) {
        maxFactors = maxFactors || 3;
        if (!reasoning) return [];
        // Split on semicolons, commas, or bullet-like patterns
        var parts = reasoning.split(/[:;]\s*|\s*\|\s*/).filter(function (s) {
            return s.trim().length > 10;
        });
        // Clean and truncate each
        return parts.slice(0, maxFactors).map(function (p) {
            return p.trim().replace(/^[-•*]\s*/, '');
        });
    }

    // Extract wind direction compass from degrees
    function windDir(deg) {
        if (deg == null || isNaN(deg)) return '';
        var dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
        return dirs[Math.round(deg / 22.5) % 16];
    }

    // Pressure trend arrow from array
    function pressureArrow(pressureForecast) {
        if (!pressureForecast || !Array.isArray(pressureForecast) || pressureForecast.length < 2) return '→';
        var recent = pressureForecast.slice(-3);
        var first = recent[0];
        var last = recent[recent.length - 1];
        if (last > first + 0.5) return '↑ Rising';
        if (last < first - 0.5) return '↓ Falling';
        return '→ Stable';
    }

    // Format date
    function formatDate(d) {
        var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        return months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
    }

    /**
     * Draw rounded rectangle path
     */
    function roundRect(ctx, x, y, w, h, r) {
        r = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }

    /**
     * Draw the bite score ring (circular progress indicator)
     */
    function drawScoreRing(ctx, cx, cy, radius, score) {
        var lineWidth = 16;
        var color = scoreColor(score);

        // Background ring
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = lineWidth;
        ctx.stroke();

        // Score arc (starts at top, goes clockwise)
        var startAngle = -Math.PI / 2;
        var endAngle = startAngle + (Math.PI * 2 * score / 100);

        // Glow effect
        ctx.shadowColor = color;
        ctx.shadowBlur = 25;

        ctx.beginPath();
        ctx.arc(cx, cy, radius, startAngle, endAngle);
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.lineCap = 'round';
        ctx.stroke();

        // Reset shadow
        ctx.shadowBlur = 0;
    }

    /**
     * Render the full forecast card to a canvas and return the canvas element
     */
    function render(data, formData) {
        formData = formData || {};
        var canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        var ctx = canvas.getContext('2d');

        // === BACKGROUND ===
        var bgGrad = ctx.createLinearGradient(0, 0, 0, H);
        bgGrad.addColorStop(0, COLORS.bgTop);
        bgGrad.addColorStop(0.5, COLORS.bgMid);
        bgGrad.addColorStop(1, COLORS.bgBot);
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, W, H);

        // Subtle radial glow at top center
        var glow = ctx.createRadialGradient(W / 2, 200, 50, W / 2, 200, 500);
        glow.addColorStop(0, 'rgba(0, 243, 255, 0.08)');
        glow.addColorStop(1, 'rgba(0, 243, 255, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, W, 500);

        var y = 0; // cursor

        // === HEADER ===
        y = 60;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // App name
        ctx.font = 'bold 36px Inter, Arial, sans-serif';
        ctx.fillStyle = COLORS.cyanBright;
        ctx.fillText('⚡ FishSmart Pro', W / 2, y);

        // Date
        y += 45;
        ctx.font = '500 22px Inter, Arial, sans-serif';
        ctx.fillStyle = COLORS.grayMid;
        ctx.fillText(formatDate(new Date()), W / 2, y);

        // === LOCATION & SPECIES ===
        y += 55;
        var location = formData.location || 'Unknown Location';
        var species = formData.species || 'Unknown Species';

        ctx.font = 'bold 30px Inter, Arial, sans-serif';
        ctx.fillStyle = COLORS.white;
        ctx.fillText(truncate(ctx, species, W - 120), W / 2, y);

        y += 40;
        ctx.font = '500 24px Inter, Arial, sans-serif';
        ctx.fillStyle = COLORS.cyan;
        ctx.fillText('📍 ' + truncate(ctx, location, W - 160), W / 2, y);

        // === BITE SCORE RING ===
        y += 160;
        var ringRadius = 120;
        var ringCx = W / 2;
        var ringCy = y;
        var score = typeof data.bite_probability === 'number' ? Math.round(data.bite_probability) : 0;

        drawScoreRing(ctx, ringCx, ringCy, ringRadius, score);

        // Score number in center
        ctx.font = 'bold 80px Inter, Arial, sans-serif';
        ctx.fillStyle = scoreColor(score);
        ctx.fillText(String(score), ringCx, ringCy);

        // Score label below ring
        y = ringCy + ringRadius + 45;
        ctx.font = 'bold 26px Inter, Arial, sans-serif';
        ctx.fillStyle = scoreColor(score);
        ctx.fillText(scoreLabel(score), W / 2, y);

        // Bite rank from engine
        y += 35;
        ctx.font = '500 20px Inter, Arial, sans-serif';
        ctx.fillStyle = COLORS.grayLight;
        ctx.fillText(data.bite_rank || '', W / 2, y);

        // === TOP FACTORS PANEL ===
        y += 60;
        var panelX = 60;
        var panelW = W - 120;
        var factors = extractFactors(data.bite_reasoning, 3);

        if (factors.length > 0) {
            var factorPanelH = 50 + factors.length * 38;
            ctx.fillStyle = COLORS.panel;
            roundRect(ctx, panelX, y, panelW, factorPanelH, 20);
            ctx.fill();
            ctx.strokeStyle = COLORS.panelBorder;
            ctx.lineWidth = 1;
            ctx.stroke();

            // Panel title
            ctx.textAlign = 'left';
            ctx.font = 'bold 18px Inter, Arial, sans-serif';
            ctx.fillStyle = COLORS.cyan;
            ctx.fillText('🔬 WHY THIS SCORE', panelX + 25, y + 32);

            // Factors
            ctx.font = '500 20px Inter, Arial, sans-serif';
            ctx.fillStyle = COLORS.grayLight;
            for (var i = 0; i < factors.length; i++) {
                var fy = y + 65 + i * 38;
                var bullet = '• ';
                ctx.fillStyle = COLORS.cyan;
                ctx.fillText(bullet, panelX + 25, fy);
                ctx.fillStyle = COLORS.grayLight;
                var factorText = truncate(ctx, factors[i], panelW - 100);
                ctx.fillText(factorText, panelX + 45, fy);
            }

            y += factorPanelH + 25;
        } else {
            y += 25;
        }

        // === TOP LURE PICK ===
        var lures = data.recommended_lures;
        if (lures && Array.isArray(lures) && lures.length > 0) {
            var topLure = lures[0];
            var lureRank = topLure.rank || '';
            var rankColor = lureRank === 'Excellent' ? COLORS.greenNeon :
                            lureRank === 'Very Good' ? COLORS.teal : COLORS.grayLight;

            ctx.textAlign = 'center';
            ctx.font = 'bold 18px Inter, Arial, sans-serif';
            ctx.fillStyle = COLORS.cyan;
            ctx.fillText('🎣 TOP LURE PICK', W / 2, y + 15);

            y += 50;
            ctx.font = 'bold 28px Inter, Arial, sans-serif';
            ctx.fillStyle = COLORS.white;
            ctx.fillText(truncate(ctx, topLure.name || 'Unknown', W - 160), W / 2, y);

            if (lureRank) {
                y += 35;
                ctx.font = 'bold 22px Inter, Arial, sans-serif';
                ctx.fillStyle = rankColor;
                ctx.fillText(lureRank, W / 2, y);
            }

            y += 50;
        } else {
            y += 30;
        }

        // === CONDITIONS STRIP ===
        var condY = H - 310;
        ctx.fillStyle = COLORS.panel;
        roundRect(ctx, panelX, condY, panelW, 120, 20);
        ctx.fill();
        ctx.strokeStyle = COLORS.panelBorder;
        ctx.lineWidth = 1;
        ctx.stroke();

        // Condition items
        var weather = data.weather || {};
        var condItems = [];

        if (data.water_temp != null) {
            condItems.push({ label: 'WATER', value: Math.round(data.water_temp) + '°F', color: COLORS.cyan });
        }
        if (weather.temp != null) {
            condItems.push({ label: 'AIR', value: Math.round(weather.temp) + '°F', color: COLORS.yellow });
        }
        if (weather.wind && weather.wind.speed != null) {
            condItems.push({ label: 'WIND', value: Math.round(weather.wind.speed) + ' mph', color: COLORS.grayLight });
        }
        if (weather.pressure != null) {
            var inHg = (weather.pressure * 0.029529983071445).toFixed(2);
            var arrow = pressureArrow(data.pressure_forecast);
            condItems.push({ label: 'PRESSURE', value: inHg + ' inHg', sub: arrow, color: COLORS.purple });
        }
        if (data.solunar && data.solunar.moon_phase) {
            condItems.push({ label: 'MOON', value: data.solunar.moon_phase, color: COLORS.purple });
        }

        // Lay out condition items in a row
        var itemWidth = panelW / condItems.length;
        ctx.textAlign = 'center';
        for (var c = 0; c < condItems.length; c++) {
            var item = condItems[c];
            var cx = panelX + itemWidth * c + itemWidth / 2;
            var cy = condY + 30;

            ctx.font = 'bold 14px Inter, Arial, sans-serif';
            ctx.fillStyle = COLORS.grayDark;
            ctx.fillText(item.label, cx, cy);

            ctx.font = 'bold 24px Inter, Arial, sans-serif';
            ctx.fillStyle = item.color;
            ctx.fillText(truncate(ctx, item.value, itemWidth - 20), cx, cy + 30);

            if (item.sub) {
                ctx.font = '500 16px Inter, Arial, sans-serif';
                ctx.fillStyle = COLORS.grayMid;
                ctx.fillText(item.sub, cx, cy + 55);
            }
        }

        // === FOOTER / WATERMARK ===
        var footerY = H - 130;
        ctx.textAlign = 'center';

        // Divider line
        ctx.beginPath();
        ctx.moveTo(panelX + 40, footerY);
        ctx.lineTo(W - panelX - 40, footerY);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // CTA text
        ctx.font = 'bold 24px Inter, Arial, sans-serif';
        ctx.fillStyle = COLORS.cyanBright;
        ctx.fillText('Get your free fishing forecast', W / 2, footerY + 35);

        // URL
        ctx.font = '500 20px Inter, Arial, sans-serif';
        ctx.fillStyle = COLORS.grayLight;
        ctx.fillText('fishsmart-pro.com', W / 2, footerY + 65);

        // Powered by
        ctx.font = '500 14px Inter, Arial, sans-serif';
        ctx.fillStyle = COLORS.grayDark;
        ctx.fillText('⚡ Generated by FishSmart Pro — Science-Backed Fishing Intelligence', W / 2, H - 35);

        return canvas;
    }

    /**
     * Generate the card, convert to PNG blob, and trigger download.
     * Also returns the blob URL for optional in-app preview.
     */
    function generate(data, formData) {
        return new Promise(function (resolve, reject) {
            try {
                var canvas = render(data, formData);
                canvas.toBlob(function (blob) {
                    if (!blob) {
                        reject(new Error('Failed to generate image'));
                        return;
                    }
                    var url = URL.createObjectURL(blob);

                    // Trigger download
                    var location = (formData.location || 'fishing').replace(/[^a-z0-9]/gi, '_').toLowerCase();
                    var species = (formData.species || 'forecast').replace(/[^a-z0-9]/gi, '_').toLowerCase();
                    var date = new Date().toISOString().slice(0, 10);
                    var filename = 'fishsmart-' + species + '-' + location + '-' + date + '.png';

                    var a = document.createElement('a');
                    a.href = url;
                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);

                    resolve({ url: url, blob: blob, filename: filename });
                }, 'image/png', 0.95);
            } catch (err) {
                reject(err);
            }
        });
    }

    /**
     * Generate card and attempt native Web Share API if available (mobile).
     * Falls back to download on desktop.
     */
    function share(data, formData) {
        return generate(data, formData).then(function (result) {
            // Try Web Share API with file (mobile-first)
            if (navigator.canShare && navigator.canShare({ files: [new File([result.blob], result.filename, { type: 'image/png' })] })) {
                return navigator.share({
                    title: 'FishSmart Pro Forecast',
                    text: 'Check out my fishing forecast for ' + (formData.species || '') + ' at ' + (formData.location || '') + '!',
                    files: [new File([result.blob], result.filename, { type: 'image/png' })]
                }).then(function () {
                    URL.revokeObjectURL(result.url);
                    return { shared: true, method: 'web-share' };
                }).catch(function () {
                    // User cancelled share — file already downloaded as fallback
                    return { shared: false, method: 'download', url: result.url };
                });
            }
            // Desktop fallback — file already downloaded
            return { shared: false, method: 'download', url: result.url };
        });
    }

    // Export
    global.ForecastCard = {
        render: render,
        generate: generate,
        share: share
    };

})(typeof window !== 'undefined' ? window : this);

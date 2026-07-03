/**
 * Content Security Policy (CSP) Middleware
 * 
 * Implements strict CSP headers that:
 * - Block unsafe-inline for scripts (use nonces instead)
 * - Block javascript: URIs
 * - Block unsafe-eval (except for wasm if needed)
 * - Allow inline styles with 'unsafe-inline' (pragmatic approach - CSS XSS is rare)
 * 
 * Security approach:
 * - Scripts: Strict nonce-based CSP (no inline scripts without nonce)
 * - Styles: Allow inline styles (hashing all inline CSS is impractical)
 * - URIs: Block javascript:, data:text/html, etc.
 */

const crypto = require('crypto');

const NONCE_LENGTH = 32;

/**
 * Generate cryptographically secure nonce
 * @returns {string} Base64 encoded nonce
 */
function generateNonce() {
    return crypto.randomBytes(NONCE_LENGTH).toString('base64');
}

/**
 * Generate CSP header value with nonce
 * @param {string} nonce - CSP nonce
 * @param {object} options - CSP configuration options
 * @returns {string} CSP policy string
 */
function generateCSPPolicy(nonce, options = {}) {
    const {
        reportOnly = false,
        reportUri = null,
        allowEval = true, // Required for Chart.js/WebAssembly
        allowInlineStyles = true, // Pragmatic: CSS XSS is low risk
        extraScriptSrc = [],
        extraStyleSrc = [],
        extraImgSrc = [],
        extraConnectSrc = [],
        extraFontSrc = [],
        extraFrameSrc = [],
        extraObjectSrc = [],
        upgradeInsecureRequests = true,
    } = options;

    // Base policy directives
    const directives = {
        'default-src': ["'self'"],
        
        // Scripts: STRICT - nonce required for inline, no unsafe-inline
        'script-src': [
            "'self'",
            `'nonce-${nonce}'`,
            'https://cdn.jsdelivr.net',
            'https://cdn.tailwindcss.com',
            'https://unpkg.com',
            ...(allowEval ? ["'wasm-unsafe-eval'"] : []),
            ...extraScriptSrc
        ],
        
        // Styles: Allow inline styles (pragmatic approach)
        // 'unsafe-inline' for styles is acceptable - CSS-based XSS is extremely rare
        'style-src': [
            "'self'",
            ...(allowInlineStyles ? ["'unsafe-inline'"] : [`'nonce-${nonce}'`]),
            'https://fonts.googleapis.com',
            ...extraStyleSrc
        ],
        
        // Images
        'img-src': [
            "'self'",
            'data:',
            'https:',
            'blob:',
            ...extraImgSrc
        ],
        
        // Fonts
        'font-src': [
            "'self'",
            'https://fonts.gstatic.com',
            ...extraFontSrc
        ],
        
        // API connections
        'connect-src': [
            "'self'",
            'https://cdn.jsdelivr.net',
            'https://cdn.tailwindcss.com',
            'https://unpkg.com',
            'https://fonts.googleapis.com',
            'https://fonts.gstatic.com',
            ...extraConnectSrc
        ],
        
        // Frames - restrict to same origin
        'frame-src': [
            "'self'",
            ...extraFrameSrc
        ],
        
        // Objects/plugins - block all (Flash, Java, etc)
        'object-src': ["'none'", ...extraObjectSrc],
        
        // Media
        'media-src': ["'self'"],
        
        // Workers
        'worker-src': ["'self'", 'blob:'],
        
        // Manifest
        'manifest-src': ["'self'"],
        
        // Form actions - prevent form hijacking to external sites
        'form-action': ["'self'"],
        
        // Base URI - prevent base tag hijacking
        'base-uri': ["'self'"],
        
        // Frame ancestors - prevent clickjacking
        'frame-ancestors': ["'self'"],
        
        // Upgrade insecure requests (HTTP to HTTPS)
        ...(upgradeInsecureRequests ? { 'upgrade-insecure-requests': [] } : {}),
        
        // Report URI for violations
        ...(reportUri ? { 'report-uri': [reportUri] } : {}),
    };

    // Build policy string
    const policyParts = [];
    for (const [directive, values] of Object.entries(directives)) {
        if (values.length > 0) {
            policyParts.push(`${directive} ${values.join(' ')}`);
        }
    }

    return policyParts.join('; ');
}

/**
 * Express middleware to set CSP headers with nonce
 * @param {object} options - CSP configuration
 * @returns {Function} Express middleware
 */
function cspMiddleware(options = {}) {
    return (req, res, next) => {
        // Generate unique nonce for this request
        const nonce = generateNonce();
        
        // Store nonce in res.locals for template access
        res.locals.cspNonce = nonce;
        
        // Generate CSP policy
        const policy = generateCSPPolicy(nonce, options);
        
        // Set appropriate header
        const headerName = options.reportOnly 
            ? 'Content-Security-Policy-Report-Only'
            : 'Content-Security-Policy';
        
        res.setHeader(headerName, policy);
        
        // Also set Referrer-Policy for additional security
        if (!res.getHeader('Referrer-Policy')) {
            res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        }
        
        next();
    };
}

/**
 * Express middleware for strict CSP (production mode)
 * 
 * KEY SECURITY FEATURES:
 * - Blocks unsafe-inline scripts (XSS protection)
 * - Blocks javascript: URIs (XSS protection)  
 * - Blocks unsafe-eval (except wasm)
 * - Allows inline styles (pragmatic - CSS injection is rare)
 */
function strictCSP() {
    return cspMiddleware({
        reportOnly: false,
        allowEval: true,        // Required for Chart.js/WebAssembly
        allowInlineStyles: true, // Pragmatic: CSS XSS is low risk
        upgradeInsecureRequests: true,
    });
}

/**
 * Express middleware for report-only CSP (testing mode)
 * Logs violations without blocking - use before enabling strict mode
 */
function reportOnlyCSP(reportUri = '/api/csp-report') {
    return cspMiddleware({
        reportOnly: true,
        reportUri,
        allowEval: true,
        allowInlineStyles: true,
    });
}

/**
 * Middleware to handle CSP violation reports
 * Logs violations for monitoring and debugging
 */
function cspReportHandler() {
    return (req, res) => {
        const report = req.body;
        
        if (report && report['csp-report']) {
            const cspReport = report['csp-report'];
            console.warn('CSP Violation:', {
                documentUri: cspReport['document-uri'],
                violatedDirective: cspReport['violated-directive'],
                blockedUri: cspReport['blocked-uri'],
                sourceFile: cspReport['source-file'],
                lineNumber: cspReport['line-number'],
                timestamp: new Date().toISOString(),
            });
        }
        
        // Always return 204 for CSP reports
        res.status(204).end();
    };
}

/**
 * Helper to generate nonce attribute for templates
 * @param {string} nonce - The nonce value
 * @returns {string} HTML attribute string
 */
function nonceAttr(nonce) {
    return nonce ? `nonce="${nonce}"` : '';
}

module.exports = {
    generateNonce,
    generateCSPPolicy,
    cspMiddleware,
    strictCSP,
    reportOnlyCSP,
    cspReportHandler,
    nonceAttr,
};

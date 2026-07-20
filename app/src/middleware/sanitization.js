/**
 * XSS Sanitization Middleware using DOMPurify
 * 
 * Implements battle-tested sanitization for all user input and reflected content.
 * Prevents XSS attacks by sanitizing HTML, SVG, and MathML content.
 * 
 * Security Features:
 * - Strict DOMPurify configuration with minimal allowed tags/attrs
 * - Input validation for all request bodies, query params, and headers
 * - Output sanitization for API responses containing user data
 * - URI validation to block javascript: and data: schemes
 */

let domPurifyInstance = null;
let jsdomModule = null;

/**
 * Lazy initialization of DOMPurify to avoid blocking on module load
 * JSDOM creation can be slow, so we only initialize when first needed
 */
function getDOMPurify() {
    if (!domPurifyInstance) {
        const createDOMPurify = require('dompurify');
        const { JSDOM } = require('jsdom');
        const window = new JSDOM('').window;
        domPurifyInstance = createDOMPurify(window);
    }
    return domPurifyInstance;
}

// Strict configuration - minimal allowed tags for text content
const STRICT_CONFIG = {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'p', 'br', 'span', 'ul', 'ol', 'li'],
    ALLOWED_ATTR: ['class', 'id'],
    KEEP_CONTENT: true,
    SANITIZE_DOM: true,
    SANITIZE_NAMED_PROPS: true,
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|xmpp|xxx|tel):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
};

// Permissive configuration for rich content (with style but no scripts)
const RICH_CONTENT_CONFIG = {
    ALLOWED_TAGS: [
        'p', 'br', 'strong', 'b', 'em', 'i', 'u', 'span', 'div', 
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'ul', 'ol', 'li', 'a', 'img',
        'table', 'thead', 'tbody', 'tr', 'td', 'th',
        'blockquote', 'pre', 'code', 'hr'
    ],
    ALLOWED_ATTR: [
        'href', 'src', 'alt', 'title', 'class', 'id', 'target',
        'width', 'height', 'style', 'align', 'valign', 'colspan', 'rowspan'
    ],
    ALLOW_DATA_ATTR: false,
    SANITIZE_DOM: true,
    SANITIZE_NAMED_PROPS: true,
    // Block dangerous URI schemes
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|callto):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
    // Hook to block javascript: URIs specifically
    hooks: {
        uponSanitizeAttribute: (node, data) => {
            if (data.attrName === 'href' || data.attrName === 'src') {
                const value = data.attrValue.toLowerCase().trim();
                if (value.startsWith('javascript:') || 
                    value.startsWith('data:text/html') ||
                    value.startsWith('vbscript:') ||
                    value.startsWith('mocha:') ||
                    value.startsWith('livescript:')) {
                    data.attrValue = '#';
                    data.keepAttr = true;
                }
            }
        }
    }
};

/**
 * Sanitize string using DOMPurify with specified config
 * @param {string} dirty - Untrusted input
 * @param {object} config - DOMPurify configuration
 * @returns {string} Sanitized output
 */
function sanitize(dirty, config = STRICT_CONFIG) {
    if (!dirty || typeof dirty !== 'string') {
        return dirty;
    }
    return getDOMPurify().sanitize(dirty, config);
}

/**
 * Deep sanitize an object recursively
 * @param {any} obj - Object to sanitize
 * @param {object} config - DOMPurify configuration
 * @returns {any} Sanitized object
 */
function deepSanitize(obj, config = STRICT_CONFIG) {
    if (typeof obj === 'string') {
        return sanitize(obj, config);
    }
    if (Array.isArray(obj)) {
        return obj.map(item => deepSanitize(item, config));
    }
    if (obj && typeof obj === 'object') {
        const sanitized = {};
        for (const [key, value] of Object.entries(obj)) {
            // Sanitize both keys and values
            const cleanKey = sanitize(key, config);
            sanitized[cleanKey] = deepSanitize(value, config);
        }
        return sanitized;
    }
    return obj;
}

/**
 * Express middleware to sanitize request body, query, and params
 * @param {object} options - Configuration options
 * @returns {Function} Express middleware
 */
function sanitizeRequest(options = {}) {
    const config = options.richContent ? RICH_CONTENT_CONFIG : STRICT_CONFIG;
    
    return (req, res, next) => {
        try {
            // Sanitize request body
            if (req.body && typeof req.body === 'object') {
                req.body = deepSanitize(req.body, config);
            }
            
            // Sanitize query parameters
            if (req.query && typeof req.query === 'object') {
                req.query = deepSanitize(req.query, config);
            }
            
            // Sanitize URL parameters
            if (req.params && typeof req.params === 'object') {
                req.params = deepSanitize(req.params, config);
            }
            
            // Sanitize common headers that might contain user input
            const headersToSanitize = ['referer', 'user-agent', 'x-device-id', 'x-session-token'];
            headersToSanitize.forEach(header => {
                if (req.headers[header] && typeof req.headers[header] === 'string') {
                    req.headers[header] = sanitize(req.headers[header], config);
                }
            });
            
            next();
        } catch (error) {
            console.error('Sanitization error:', error);
            res.status(400).json({
                success: false,
                error: 'Invalid input detected',
                code: 'SANITIZATION_ERROR'
            });
        }
    };
}

/**
 * Express middleware to sanitize API response data
 * Use for endpoints that return user-generated content
 * @param {object} options - Configuration options
 * @returns {Function} Express middleware
 */
function sanitizeResponse(options = {}) {
    const config = options.richContent ? RICH_CONTENT_CONFIG : STRICT_CONFIG;
    
    return (req, res, next) => {
        // Store original json method
        const originalJson = res.json.bind(res);
        
        // Override json method to sanitize data
        res.json = (data) => {
            try {
                const sanitizedData = deepSanitize(data, config);
                return originalJson(sanitizedData);
            } catch (error) {
                console.error('Response sanitization error:', error);
                return originalJson({
                    success: false,
                    error: 'Error processing response'
                });
            }
        };
        
        next();
    };
}

/**
 * Validate and sanitize a URI to prevent javascript: and other dangerous schemes
 * @param {string} uri - URI to validate
 * @returns {string|null} Sanitized URI or null if invalid
 */
function sanitizeUri(uri) {
    if (!uri || typeof uri !== 'string') {
        return null;
    }
    
    const lowerUri = uri.toLowerCase().trim();
    
    // Block dangerous schemes
    const dangerousSchemes = [
        'javascript:', 'data:text/html', 'vbscript:', 
        'mocha:', 'livescript:', 'about:', 'blob:', 'filesystem:'
    ];
    
    for (const scheme of dangerousSchemes) {
        if (lowerUri.startsWith(scheme)) {
            console.warn(`Blocked dangerous URI scheme: ${scheme}`);
            return null;
        }
    }
    
    // Allow safe schemes
    const safeSchemes = ['http:', 'https:', 'mailto:', 'tel:', '#'];
    const hasSafeScheme = safeSchemes.some(scheme => lowerUri.startsWith(scheme));
    
    if (!hasSafeScheme && lowerUri.includes(':')) {
        // Unknown scheme - block it
        console.warn(`Blocked unknown URI scheme: ${uri}`);
        return null;
    }
    
    // Sanitize the URI
    return sanitize(uri, STRICT_CONFIG);
}

/**
 * Create express middleware for URI validation
 * Validates redirect URLs and other URIs in request
 */
function validateUris() {
    return (req, res, next) => {
        // Check for redirect parameter (common XSS vector)
        if (req.query.redirect || req.query.returnUrl || req.query.next) {
            const redirectUrl = req.query.redirect || req.query.returnUrl || req.query.next;
            const sanitized = sanitizeUri(redirectUrl);
            
            if (!sanitized) {
                console.warn(`Blocked dangerous redirect URL: ${redirectUrl}`);
                delete req.query.redirect;
                delete req.query.returnUrl;
                delete req.query.next;
            } else {
                // Update with sanitized version
                if (req.query.redirect) req.query.redirect = sanitized;
                if (req.query.returnUrl) req.query.returnUrl = sanitized;
                if (req.query.next) req.query.next = sanitized;
            }
        }
        
        next();
    };
}

module.exports = {
    sanitize,
    deepSanitize,
    sanitizeRequest,
    sanitizeResponse,
    sanitizeUri,
    validateUris,
    STRICT_CONFIG,
    RICH_CONTENT_CONFIG,
    getDOMPurify
};

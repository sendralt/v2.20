'use strict';

/**
 * Centralized fetch wrapper that ALWAYS includes `Accept-Encoding: identity`.
 *
 * On Render (and some other hosts), gzip-encoded responses from external
 * APIs get corrupted when passed through the proxy layer. The \u001f gzip
 * magic byte prefix causes response.json() to fail silently, returning null.
 *
 * This wrapper makes the fix structural — any external fetch call that
 * goes through safeFetch() cannot regress.
 */

const DEFAULT_HEADERS = {
    'Accept': 'application/json',
    'Accept-Encoding': 'identity'
};

/**
 * Safe fetch — always includes Accept-Encoding: identity.
 * Signature matches native fetch().
 * @param {string|URL|Request} resource
 * @param {Object} [options]
 * @returns {Promise<Response>}
 */
async function safeFetch(resource, options = {}) {
    const userHeaders = options.headers || {};
    const headers = {
        ...DEFAULT_HEADERS,
        ...userHeaders // user headers win, but identity is the default
    };
    // If user explicitly set Accept-Encoding, respect it. Otherwise force identity.
    if (!('Accept-Encoding' in userHeaders) && !('accept-encoding' in userHeaders)) {
        headers['Accept-Encoding'] = 'identity';
    }
    return fetch(resource, { ...options, headers });
}

module.exports = { safeFetch, DEFAULT_HEADERS };

"use strict";

/**
 * Stateless HMAC-signed free-tier token service.
 *
 * Replaces phantom account creation and in-memory sessions for anonymous users.
 * The token is a compact, URL-safe (base64url) JSON payload plus an
 * HMAC-SHA256 signature. Because the signature covers the payload, the
 * client cannot forge or tamper with the usage count without invalidating
 * the token. The server is the only entity that can mint valid tokens.
 *
 * Token wire format (single line, dot-separated):
 *   <base64url(payload_json)>.<base64url(hmac_sha256_hexdigest)>
 *
 * Security properties:
 *   - Stateless: no DB/session lookup required to validate the primary counter
 *   - Tamper-evident: any payload modification breaks the signature
 *   - Timing-safe signature comparison (crypto.timingSafeEqual)
 *   - Fail-closed: any parse/validation error yields null, never a partial object
 *   - No secrets in payload; only counts and hashes
 */

const crypto = require('crypto');

const COOKIE_NAME = 'fsp_free_token';
const HEADER_NAME = 'x-fsp-free-token';

/**
 * Resolve the HMAC signing key from the environment.
 * Prefers STRIPE_WEBHOOK_SECRET (already rotated via Stripe dashboard),
 * then GEMINI_API_KEY. Either must be present — without one we cannot
 * securely mint tokens and must hard-fail at startup of the token service.
 */
function resolveSigningKey() {
    const key = process.env.STRIPE_WEBHOOK_SECRET || process.env.GEMINI_API_KEY;
    if (!key || typeof key !== 'string' || key.length < 16) {
        throw new Error(
            'free-tier-token: no suitable signing key in env ' +
            '(need STRIPE_WEBHOOK_SECRET or GEMINI_API_KEY, >= 16 chars)'
        );
    }
    return key;
}

// Lazily resolve the key once per process; cache it.
let _cachedKey = null;
function getSigningKey() {
    if (_cachedKey === null) _cachedKey = resolveSigningKey();
    return _cachedKey;
}

/**
 * base64url encode a Buffer (RFC 4648 §5 — URL/filename safe alphabet).
 * Replaces '+'/'/' and strips '=' padding for cookie/header safety.
 */
function base64urlEncode(buf) {
    return buf.toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}

/**
 * base64url decode a string into a Buffer. Tolerates standard base64 too.
 */
function base64urlDecode(str) {
    if (typeof str !== 'string' || str.length === 0) return null;
    const padLen = (4 - (str.length % 4)) % 4;
    const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(padLen);
    try {
        return Buffer.from(padded, 'base64');
    } catch {
        return null;
    }
}

/**
 * Compute the HMAC-SHA256 signature (hex) over a payload string.
 */
function sign(payloadStr) {
    return crypto
        .createHmac('sha256', getSigningKey())
        .update(payloadStr, 'utf8')
        .digest('hex');
}

/**
 * Constant-time string equality to avoid signature-oracle timing leaks.
 * Both inputs must be equal-length hex strings.
 */
function safeEqualHex(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    if (a.length !== b.length || a.length === 0) return false;
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Build a signed token string from a payload object.
 * @param {{count:number, ipHash:string, deviceHash:string, createdAt:number, expiresAt:number}} payload
 * @returns {string} token in the form <b64url(payload)>.<b64url(sig)>
 */
function createToken(payload) {
    if (!payload || typeof payload !== 'object') {
        throw new Error('createToken: payload object required');
    }
    // Validate required fields defensively — never emit a malformed token.
    const clean = {
        count: Number.isFinite(payload.count) ? Math.floor(payload.count) : 0,
        ipHash: typeof payload.ipHash === 'string' ? payload.ipHash : '',
        deviceHash: typeof payload.deviceHash === 'string' ? payload.deviceHash : '',
        createdAt: Number.isFinite(payload.createdAt) ? payload.createdAt : Date.now(),
        expiresAt: Number.isFinite(payload.expiresAt) ? payload.expiresAt : 0
    };

    const payloadJson = JSON.stringify(clean);
    const payloadB64 = base64urlEncode(Buffer.from(payloadJson, 'utf8'));
    const sigHex = sign(payloadB64);
    const sigB64 = base64urlEncode(Buffer.from(sigHex, 'utf8'));
    return payloadB64 + '.' + sigB64;
}

/**
 * Verify a token string and return its payload if valid, else null.
 * Fail-closed: every error path returns null (no exceptions to caller).
 *
 * Checks performed:
 *   1. Well-formed structure (exactly two dot-separated parts)
 *   2. Signature matches payload (timing-safe)
 *   3. Payload decodes to a JSON object with expected shape
 *   4. expiresAt is in the future
 *
 * @param {string} token
 * @returns {{count:number, ipHash:string, deviceHash:string, createdAt:number, expiresAt:number}|null}
 */
function verifyToken(token) {
    if (typeof token !== 'string' || token.length === 0 || token.length > 2048) return null;

    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [payloadB64, sigB64] = parts;

    // Decode signature and recompute over the received payload bytes.
    const sigBuf = base64urlDecode(sigB64);
    if (!sigBuf) return null;
    const receivedSig = sigBuf.toString('utf8');
    const expectedSig = sign(payloadB64);

    // Timing-safe comparison of hex signatures.
    if (!safeEqualHex(receivedSig, expectedSig)) return null;

    // Signature valid — decode payload.
    const payloadBuf = base64urlDecode(payloadB64);
    if (!payloadBuf) return null;

    let parsed;
    try {
        parsed = JSON.parse(payloadBuf.toString('utf8'));
    } catch {
        return null;
    }

    if (!parsed || typeof parsed !== 'object') return null;

    // Enforce minimal shape — fail closed on missing/invalid fields.
    const count = Number(parsed.count);
    const createdAt = Number(parsed.createdAt);
    const expiresAt = Number(parsed.expiresAt);
    if (!Number.isFinite(count) || !Number.isFinite(createdAt) || !Number.isFinite(expiresAt)) {
        return null;
    }
    if (typeof parsed.ipHash !== 'string' || typeof parsed.deviceHash !== 'string') {
        return null;
    }

    // Expiry check — reject expired tokens outright (no silent refresh here).
    if (Date.now() >= expiresAt) return null;

    return {
        count: Math.max(0, Math.floor(count)),
        ipHash: parsed.ipHash,
        deviceHash: parsed.deviceHash,
        createdAt: Math.floor(createdAt),
        expiresAt: Math.floor(expiresAt)
    };
}

/**
 * Extract the raw token string from an Express request.
 * Order of precedence: HttpOnly cookie first (authoritative), then header
 * fallback (for non-browser clients / tests).
 *
 * @param {object} req - Express request
 * @returns {string|null}
 */
function extractTokenFromRequest(req) {
    if (!req) return null;

    // Cookie is the primary transport (HttpOnly — not JS-readable).
    if (req.cookies && typeof req.cookies[COOKIE_NAME] === 'string') {
        return req.cookies[COOKIE_NAME];
    }

    // Header fallback for API clients and tests.
    const headerVal = req.headers && req.headers[HEADER_NAME];
    if (typeof headerVal === 'string' && headerVal.length > 0) {
        return headerVal;
    }

    return null;
}

module.exports = {
    COOKIE_NAME,
    HEADER_NAME,
    createToken,
    verifyToken,
    extractTokenFromRequest,
    // Exported for testing / key rotation tooling only — never call from app code.
    _resolveSigningKey: resolveSigningKey
};

/**
 * auth-utils.js — Shared authentication header utilities (H-2)
 *
 * Single source of truth for building auth headers.
 * Used by both app.js and subscription.js.
 *
 * Load this BEFORE app.js and subscription.js in index.html.
 */
(function(global) {
    'use strict';

    var _sessionToken = null;
    var _deviceId = null;

    /**
     * Get the device ID from cache or localStorage.
     * @returns {string}
     */
    function getDeviceId() {
        if (_deviceId) return _deviceId;
        try {
            _deviceId = localStorage.getItem('fishsmart_device_id') || 'unknown';
        } catch (e) {
            _deviceId = 'unknown';
        }
        return _deviceId;
    }

    /**
     * Get the session token from cache or localStorage.
     * @returns {string|null}
     */
    function getSessionToken() {
        if (_sessionToken) return _sessionToken;
        try {
            _sessionToken = localStorage.getItem('fishsmart_session_token') || null;
        } catch (e) {
            _sessionToken = null;
        }
        return _sessionToken;
    }

    /**
     * Build authentication headers for API requests.
     * Reads device ID and session token from localStorage if not explicitly set.
     * @returns {{ 'X-Device-ID': string, 'X-Session-Token'?: string }}
     */
    function getAuthHeaders() {
        var headers = {};
        var token = getSessionToken();
        var devId = getDeviceId();
        if (token) headers['X-Session-Token'] = token;
        if (devId) headers['X-Device-ID'] = devId;
        return headers;
    }

    /**
     * Set the session token (called by subscription.js after session creation).
     * @param {string|null} token
     */
    function setSessionToken(token) {
        _sessionToken = token;
        if (token) {
            try { localStorage.setItem('fishsmart_session_token', token); } catch (e) {}
        } else {
            try { localStorage.removeItem('fishsmart_session_token'); } catch (e) {}
        }
    }

    /**
     * Set the device ID (called by subscription.js after device registration).
     * @param {string|null} id
     */
    function setDeviceId(id) {
        _deviceId = id;
        if (id) {
            try { localStorage.setItem('fishsmart_device_id', id); } catch (e) {}
        }
    }

    // Expose globally
    global.AuthUtils = {
        getAuthHeaders: getAuthHeaders,
        getDeviceId: getDeviceId,
        getSessionToken: getSessionToken,
        setSessionToken: setSessionToken,
        setDeviceId: setDeviceId
    };

})(typeof window !== 'undefined' ? window : this);

'use strict';
/**
 * Root entry point for Render deployment.
 * Delegates to app/server.js — allows Render to keep using `node server.js`
 * without dashboard changes after the monorepo restructuring.
 */
require('./app/server.js');

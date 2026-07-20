'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { detectDeadFiles } = require('../scripts/detect-dead-files');

/**
 * Dead File Detector Test
 *
 * Runs the dead-file detector as part of the test suite.
 * Fails if any .js source file in app/ is not require()'d by any other file
 * (and is not in the ALLOWLIST in scripts/detect-dead-files.js).
 *
 * This prevents stale duplicate files (like the old app/ai.js) from accumulating.
 *
 * If this test fails:
 * 1. Check if the file is an entry point or tooling script — add to ALLOWLIST
 * 2. If it's genuinely dead code — delete it
 */
describe('Dead File Detector', function() {
    it('no source files are orphaned (all are require()\'d or allowlisted)', function() {
        const { deadFiles, scanned } = detectDeadFiles();
        assert.equal(
            deadFiles.length, 0,
            'Dead files found (not require()\'d by any file and not in ALLOWLIST):\n' +
            deadFiles.map(function(f) { return '  - ' + f; }).join('\n') +
            '\n\nFix: either delete the file(s) or add to ALLOWLIST in scripts/detect-dead-files.js\n' +
            '(scanned ' + scanned + ' source files)'
        );
    });
});

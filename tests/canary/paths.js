/**
 * Single source of truth for canary file locations. Everything lives under
 * gitignored .canary/ — credentials and reports never leave the machine.
 */

import path from 'node:path';

export const CANARY_DIR = '.canary';
export const STATE_PATH = path.join(CANARY_DIR, 'state.json');
export const PROBE_BUNDLE = path.join(CANARY_DIR, 'probe.bundle.js');
export const LAST_RUN_PATH = path.join(CANARY_DIR, 'last-run.json');
// Must match the TB_BUILD=canary outDir in esbuild.config.js
export const EXTENSION_DIR = path.join(CANARY_DIR, 'dist');

/**
 * src/sdk/AndyEngine — Re-export of the main engine
 *
 * The canonical AndyEngine class lives in index.js (root entry point).
 * This file provides a convenient import path from within src/sdk/.
 *
 * PUBLIC COMPATIBILITY EXCEPTION: thin re-export for src/sdk/ internal convenience.
 * This is the ONLY allowed reverse dependency from src/ to root index.js.
 */

module.exports = require('../../index');

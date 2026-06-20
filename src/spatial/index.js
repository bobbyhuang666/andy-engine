/**
 * src/spatial — Spatial Layer
 *
 * Continuous coordinate space engine, spatial hashing, region grid, and world map.
 * Replaces spatial/ as the canonical location.
 */

const SpatialEngine = require('./SpatialEngine');
const SpatialHash = require('./SpatialHash');
const RegionGrid = require('./RegionGrid');
const { WorldMap, RegionDef } = require('./WorldMap');

module.exports = {
  SpatialEngine,
  SpatialHash,
  RegionGrid,
  WorldMap,
  RegionDef,
};

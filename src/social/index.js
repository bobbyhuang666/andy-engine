/**
 * src/social — Social Layer
 *
 * Global social graph and relationship model.
 * Replaces social/ as the canonical location.
 */

const SocialGraph = require('./SocialGraph');
const Relationship = require('./Relationship');

module.exports = {
  SocialGraph,
  Relationship,
};

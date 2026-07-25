const crypto = require('crypto');

function digest(data) {
  if (!Buffer.isBuffer(data) && !(data instanceof Uint8Array)) {
    throw new TypeError('checkpoint data must be Buffer or Uint8Array');
  }
  return crypto.createHash('sha256').update(data).digest('hex');
}

function createMeta(tick, virtualTime, data) {
  return {
    checkpoint: {
      algorithm: 'sha256',
      digest: digest(data),
      tick,
      virtualTime,
    },
  };
}

function verify(snapshot) {
  const checkpoint = snapshot?.meta?.checkpoint;
  if (!checkpoint || checkpoint.algorithm !== 'sha256' ||
      typeof checkpoint.digest !== 'string' || !/^[a-f0-9]{64}$/i.test(checkpoint.digest)) return false;
  if (checkpoint.tick !== snapshot.tick || checkpoint.virtualTime !== snapshot.virtualTime) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(checkpoint.digest, 'hex'), Buffer.from(digest(snapshot.data), 'hex'));
  } catch {
    return false;
  }
}

module.exports = { createMeta, verify };

/**
 * binaryCopy — defensive copy for snapshot/story binary data (RFC W1 / Patch B)
 *
 * Single normalization point for copying binary data at store boundaries.
 * Handles Buffer, any ArrayBufferView (Uint8Array, Int8Array, ...), and
 * ArrayBuffer. Prevents external mutation from polluting store internals
 * and vice versa.
 *
 * Previously MemoryStore only copied Buffer, leaking plain Uint8Array
 * references. SQLiteStore returns fresh Buffer rows from better-sqlite3
 * so it is naturally isolated, but uses this helper for parity.
 */

/**
 * Return an independent copy of binary data.
 *
 * @param {Buffer|ArrayBufferView|ArrayBuffer} value
 * @returns {Buffer} a fresh copy (Buffer for interop with saveCheckpoint comparison)
 * @throws {TypeError} if value is not a recognized binary type
 */
function binaryCopy(value) {
  if (Buffer.isBuffer(value)) {
    // Buffer.from(Buffer) copies the contents.
    return Buffer.from(value);
  }
  if (value instanceof ArrayBuffer) {
    // Buffer.from(ArrayBuffer) shares memory, so copy via Uint8Array slice first.
    return Buffer.from(new Uint8Array(value).slice());
  }
  if (ArrayBuffer.isView(value)) {
    // Buffer.from(buffer, byteOffset, length) SHARES the underlying ArrayBuffer,
    // so it is not a copy. Copy the viewed region via Uint8Array.slice() first,
    // which allocates a new ArrayBuffer, then wrap that in a Buffer.
    const region = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    return Buffer.from(region.slice());
  }
  throw new TypeError('snapshot data must be binary (Buffer, ArrayBufferView, or ArrayBuffer)');
}

module.exports = { binaryCopy };

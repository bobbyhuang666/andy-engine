/**
 * RNG — 可播种伪随机数发生器
 *
 * 基于 Mulberry32 算法，纯 JS 实现，无全局污染。
 *
 * 设计原则：
 *   - 确定性：相同 seed 产生完全一致的序列
 *   - 封闭性：不修改 Math.random，不污染全局
 *   - 可克隆：支持 clone() 以支持上下文分流
 */

class RNG {
  /**
   * @param {string|number} seed - 种子
   */
  constructor(seed) {
    this._seed = RNG._hashSeed(seed);
    this._state = this._seed;
  }

  /**
   * 从种子创建 RNG 实例
   * @param {string|number} seed
   * @returns {RNG}
   */
  static fromSeed(seed) {
    return new RNG(seed);
  }

  /**
   * 生成下一个随机数 (0, 1) 均匀分布
   * @returns {number}
   */
  next() {
    // Mulberry32
    this._state = (this._state + 0x6D2B79F5) | 0;
    let t = Math.imul(this._state ^ (this._state >>> 15), 1 | this._state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * 生成 [min, max) 范围内的随机整数
   * @param {number} min
   * @param {number} max
   * @returns {number}
   */
  nextInt(min, max) {
    return Math.floor(this.next() * (max - min)) + min;
  }

  /**
   * 生成 [min, max) 范围内的随机浮点数
   * @param {number} min
   * @param {number} max
   * @returns {number}
   */
  nextFloat(min, max) {
    return this.next() * (max - min) + min;
  }

  /**
   * 克隆当前 RNG 实例（复制种子状态）
   * @returns {RNG}
   */
  clone() {
    const cloned = new RNG(0);
    cloned._seed = this._seed;
    cloned._state = this._state;
    return cloned;
  }

  /**
   * 获取当前种子状态（用于序列化）
   * @returns {number}
   */
  getState() {
    return this._state;
  }

  /**
   * 从状态恢复（用于反序列化）
   * @param {number} state
   */
  setState(state) {
    this._state = state;
  }

  /**
   * 将 seed 转为 32 位整数哈希
   * @param {string|number} seed
   * @returns {number}
   * @private
   */
  static _hashSeed(seed) {
    if (typeof seed === 'number') {
      return seed | 0;
    }
    // FNV-1a 32-bit hash for strings
    let hash = 0x811c9dc5;
    const str = String(seed);
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return hash | 0;
  }
}

module.exports = { RNG };

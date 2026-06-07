/**
 * MetaStore — 模拟元数据持久化接口
 *
 * 存储模拟级别的键值对：tick_count、virtual_time、配置版本等。
 * 极简接口，类似 Redis GET/SET。
 */

/**
 * @interface MetaStore
 */
class MetaStore {
  /**
   * 获取值
   * @param {string} key
   * @returns {string|null}
   */
  async get(key) {
    throw new Error('Not implemented');
  }

  /**
   * 设置值
   * @param {string} key
   * @param {string} value
   */
  async set(key, value) {
    throw new Error('Not implemented');
  }

  /**
   * 批量设置
   * @param {Object} entries - { key: value, ... }
   */
  async setMany(entries) {
    throw new Error('Not implemented');
  }

  /**
   * 获取所有键值对
   * @returns {Object}
   */
  async getAll() {
    throw new Error('Not implemented');
  }

  /**
   * 删除键
   * @param {string} key
   */
  async delete(key) {
    throw new Error('Not implemented');
  }

  async close() {
    throw new Error('Not implemented');
  }
}

module.exports = { MetaStore };

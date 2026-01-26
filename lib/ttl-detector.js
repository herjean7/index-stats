class TTLDetector {
  /**
   * Detect TTL (Time To Live) indexes in a collection
   * @param {Collection} collection - MongoDB collection object
   * @returns {Promise<Array>} Array of TTL index information
   */
  async detectTTLIndexes(collection) {
    try {
      const indexes = await collection.listIndexes().toArray();
      const ttlIndexes = [];

      indexes.forEach(index => {
        if (this._isTTLIndex(index)) {
          ttlIndexes.push({
            name: index.name,
            key: index.key,
            expireAfterSeconds: index.expireAfterSeconds,
            field: Object.keys(index.key)[0] // TTL indexes are on single fields
          });
        }
      });

      return ttlIndexes;
    } catch (error) {
      throw new Error(`Failed to detect TTL indexes: ${error.message}`);
    }
  }

  /**
   * Check if an index is a TTL index
   * @param {Object} index - Index specification
   * @returns {boolean} True if TTL index
   */
  _isTTLIndex(index) {
    return typeof index.expireAfterSeconds === 'number';
  }
}

module.exports = TTLDetector;
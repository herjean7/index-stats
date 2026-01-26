class IndexStatsCollector {
  constructor(config = {}) {
    this.unusedDaysThreshold = config.unusedDaysThreshold || 7;
  }

  /**
   * Get index statistics for a collection
   * @param {Collection} collection - MongoDB collection object
   * @returns {Promise<Array>} Array of index statistics
   */
  async getIndexStats(collection) {
    try {
      // Get index statistics using $indexStats aggregation
      const indexStatsResult = await collection.aggregate([
        { $indexStats: {} }
      ]).toArray();

      // Return the index stats with calculated operations per day
      const enrichedStats = indexStatsResult.map(stat => {
        return {
          name: stat.name,
          key: stat.key,
          host: stat.host,
          accesses: stat.accesses,
          spec: stat.spec,
          since: stat.accesses?.since || null,
          // Calculate operations per day if we have timestamp info
          opsPerDay: this._calculateOpsPerDay(stat.accesses)
        };
      });

      return enrichedStats;
    } catch (error) {
      throw new Error(`Failed to get index stats: ${error.message}`);
    }
  }



  /**
   * Calculate operations per day based on access statistics
   * @param {Object} accesses - Access statistics from $indexStats
   * @returns {number} Operations per day
   */
  _calculateOpsPerDay(accesses) {
    if (!accesses || !accesses.since || !accesses.ops) {
      return 0;
    }

    try {
      const since = new Date(accesses.since);
      const now = new Date();
      const daysSince = (now - since) / (1000 * 60 * 60 * 24);
      
      if (daysSince <= 0) {
        return 0;
      }

      return Math.round(accesses.ops / daysSince);
    } catch (error) {
      return 0;
    }
  }

  /**
   * Extract index size from collection stats
   * @param {Object} collStats - Collection statistics
   * @param {string} indexName - Index name
   * @returns {number} Index size in bytes
   */
  _getIndexSize(collStats, indexName) {
    try {
      if (collStats.indexSizes && collStats.indexSizes[indexName]) {
        return collStats.indexSizes[indexName];
      }
      return 0;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Analyze index efficiency and provide recommendations
   * @param {Array} indexStats - Index statistics array
   * @param {Object} collectionStats - Collection statistics
   * @param {Date} lastRestart - When the node was last restarted
   * @returns {Object} Index efficiency analysis
   */
  analyzeIndexEfficiency(indexStats, collectionStats, lastRestart = null) {
    const analysis = {
      totalIndexes: indexStats.length,
      unusedIndexes: [],
      redundantIndexes: [],
      missingIndexes: [],
      recommendations: []
    };

    // Find unused indexes (no operations for the specified number of days)
    analysis.unusedIndexes = indexStats.filter(stat => {
      if (stat.name === '_id_') return false;
      
      const ops = stat.accesses?.ops || 0;
      
      // If node was recently restarted, be more lenient with unused detection
      if (lastRestart) {
        const daysSinceRestart = this._getDaysSince(lastRestart);
        // If node was restarted within our threshold period, don't mark indexes as unused
        if (daysSinceRestart < this.unusedDaysThreshold) {
          return false;
        }
      }
      
      // If no operations at all, consider it unused
      if (ops === 0) return true;
      
      // Check if index has been unused for the threshold period
      if (stat.since) {
        const daysSinceLastUse = this._getDaysSince(stat.since);
        return daysSinceLastUse >= this.unusedDaysThreshold;
      }
      
      return false;
    });



    // Detect potentially redundant indexes
    analysis.redundantIndexes = this._findRedundantIndexes(indexStats);

    // Generate recommendations
    this._generateIndexRecommendations(analysis);

    return analysis;
  }

  /**
   * Calculate days since a given date
   * @param {Date|string} date - Date to calculate from
   * @returns {number} Days since the date
   */
  _getDaysSince(date) {
    try {
      const since = new Date(date);
      const now = new Date();
      const daysSince = (now - since) / (1000 * 60 * 60 * 24);
      return Math.floor(daysSince);
    } catch (error) {
      return 0;
    }
  }

  /**
   * Find potentially redundant indexes
   * @param {Array} indexStats - Index statistics
   * @returns {Array} Potentially redundant index pairs
   */
  _findRedundantIndexes(indexStats) {
    const redundant = [];
    
    for (let i = 0; i < indexStats.length; i++) {
      for (let j = i + 1; j < indexStats.length; j++) {
        const index1 = indexStats[i];
        const index2 = indexStats[j];
        
        if (this._indexesAreRedundant(index1.key, index2.key)) {
          redundant.push({
            index1: index1.name,
            index2: index2.name,
            reason: 'One index is a prefix of another',
            recommendation: `Consider keeping only the more specific index`
          });
        }
      }
    }
    
    return redundant;
  }

  /**
   * Check if two indexes are potentially redundant
   * @param {Object} key1 - First index key
   * @param {Object} key2 - Second index key
   * @returns {boolean} True if indexes are redundant
   */
  _indexesAreRedundant(key1, key2) {
    const fields1 = Object.keys(key1);
    const fields2 = Object.keys(key2);
    
    // Check if one is a prefix of the other
    const shorter = fields1.length <= fields2.length ? fields1 : fields2;
    const longer = fields1.length > fields2.length ? fields1 : fields2;
    const shorterKey = fields1.length <= fields2.length ? key1 : key2;
    const longerKey = fields1.length > fields2.length ? key1 : key2;
    
    if (shorter.length === longer.length) {
      return false; // Same length, check if identical
    }
    
    // Check if shorter is a prefix of longer
    for (let i = 0; i < shorter.length; i++) {
      if (shorter[i] !== longer[i] || shorterKey[shorter[i]] !== longerKey[longer[i]]) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Generate index recommendations based on analysis
   * @param {Object} analysis - Index analysis object
   */
  _generateIndexRecommendations(analysis) {
    if (analysis.unusedIndexes.length > 0) {
      analysis.recommendations.push({
        type: 'drop_unused',
        priority: 'high',
        message: `Drop ${analysis.unusedIndexes.length} unused indexes to save storage space`,
        indexes: analysis.unusedIndexes.map(idx => idx.name)
      });
    }



    if (analysis.redundantIndexes.length > 0) {
      analysis.recommendations.push({
        type: 'consolidate_redundant',
        priority: 'medium',
        message: `Consolidate ${analysis.redundantIndexes.length} potentially redundant index pairs`,
        indexPairs: analysis.redundantIndexes
      });
    }
  }
}

module.exports = IndexStatsCollector;
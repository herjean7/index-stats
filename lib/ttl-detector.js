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
          const ttlInfo = {
            name: index.name,
            key: index.key,
            expireAfterSeconds: index.expireAfterSeconds,
            expireAfterDisplay: this._formatExpireAfter(index.expireAfterSeconds),
            field: Object.keys(index.key)[0], // TTL indexes are on single fields
            background: index.background || false,
            sparse: index.sparse || false
          };

          // Additional analysis
          ttlInfo.analysis = this._analyzeTTLIndex(ttlInfo);
          
          ttlIndexes.push(ttlInfo);
        }
      });

      return ttlIndexes;
    } catch (error) {
      throw new Error(`Failed to detect TTL indexes: ${error.message}`);
    }
  }

  /**
   * Get comprehensive TTL information for a collection including document analysis
   * @param {Collection} collection - MongoDB collection object
   * @returns {Promise<Object>} Comprehensive TTL analysis
   */
  async analyzeTTLBehavior(collection) {
    try {
      const ttlIndexes = await this.detectTTLIndexes(collection);
      
      if (ttlIndexes.length === 0) {
        return {
          hasTTLIndexes: false,
          ttlIndexes: [],
          documentAnalysis: null
        };
      }

      const analysis = {
        hasTTLIndexes: true,
        ttlIndexes: ttlIndexes,
        documentAnalysis: {}
      };

      // Analyze documents for each TTL field
      for (const ttlIndex of ttlIndexes) {
        const fieldAnalysis = await this._analyzeDocumentsForTTLField(
          collection, 
          ttlIndex.field,
          ttlIndex.expireAfterSeconds
        );
        
        analysis.documentAnalysis[ttlIndex.field] = fieldAnalysis;
      }

      return analysis;
    } catch (error) {
      throw new Error(`Failed to analyze TTL behavior: ${error.message}`);
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

  /**
   * Format expireAfterSeconds into human-readable format
   * @param {number} seconds - Expire after seconds value
   * @returns {string} Human-readable format
   */
  _formatExpireAfter(seconds) {
    if (seconds === 0) {
      return 'Immediate expiration';
    }

    const units = [
      { name: 'day', value: 86400 },
      { name: 'hour', value: 3600 },
      { name: 'minute', value: 60 }
    ];

    for (const unit of units) {
      if (seconds >= unit.value) {
        const count = Math.floor(seconds / unit.value);
        const remainder = seconds % unit.value;
        
        let result = `${count} ${unit.name}${count > 1 ? 's' : ''}`;
        
        if (remainder > 0) {
          const nextUnit = units[units.indexOf(unit) + 1];
          if (nextUnit && remainder >= nextUnit.value) {
            const nextCount = Math.floor(remainder / nextUnit.value);
            result += ` ${nextCount} ${nextUnit.name}${nextCount > 1 ? 's' : ''}`;
          } else if (remainder < 60) {
            result += ` ${remainder} second${remainder > 1 ? 's' : ''}`;
          }
        }
        
        return result;
      }
    }

    return `${seconds} second${seconds > 1 ? 's' : ''}`;
  }

  /**
   * Analyze a TTL index for potential issues and recommendations
   * @param {Object} ttlInfo - TTL index information
   * @returns {Object} Analysis results
   */
  _analyzeTTLIndex(ttlInfo) {
    const analysis = {
      warnings: [],
      recommendations: [],
      notes: []
    };

    // Check for immediate expiration
    if (ttlInfo.expireAfterSeconds === 0) {
      analysis.warnings.push('Immediate expiration - documents will be deleted as soon as possible');
      analysis.recommendations.push('Consider if immediate expiration is intended');
    }

    // Check for very short expiration times
    if (ttlInfo.expireAfterSeconds > 0 && ttlInfo.expireAfterSeconds < 60) {
      analysis.warnings.push(`Very short TTL (${ttlInfo.expireAfterSeconds} seconds)`);
      analysis.recommendations.push('Verify that such short expiration is intentional');
    }

    // Check for very long expiration times (more than a year)
    if (ttlInfo.expireAfterSeconds > 31536000) {
      analysis.notes.push(`Very long TTL (${this._formatExpireAfter(ttlInfo.expireAfterSeconds)})`);
      analysis.recommendations.push('Consider if such long expiration is necessary');
    }

    // Note about TTL delete process
    analysis.notes.push('TTL deletes run approximately every 60 seconds');
    analysis.notes.push('Index usage statistics do not include TTL delete operations');

    return analysis;
  }

  /**
   * Analyze documents in relation to a TTL field
   * @param {Collection} collection - MongoDB collection
   * @param {string} ttlField - TTL field name
   * @param {number} expireAfterSeconds - TTL expiration time
   * @returns {Promise<Object>} Document analysis
   */
  async _analyzeDocumentsForTTLField(collection, ttlField, expireAfterSeconds) {
    try {
      const now = new Date();
      const cutoffTime = new Date(now.getTime() - expireAfterSeconds * 1000);

      // Sample documents to understand TTL field usage
      const [
        totalCount,
        documentsWithTTLField,
        recentDocuments,
        expiredDocuments,
        nullTTLField,
        sampleDocs
      ] = await Promise.all([
        collection.estimatedDocumentCount(),
        collection.countDocuments({ [ttlField]: { $exists: true, $ne: null } }),
        collection.countDocuments({ 
          [ttlField]: { $gte: cutoffTime } 
        }),
        collection.countDocuments({ 
          [ttlField]: { $lt: cutoffTime, $exists: true } 
        }),
        collection.countDocuments({ 
          $or: [
            { [ttlField]: { $exists: false } },
            { [ttlField]: null }
          ]
        }),
        collection.find({ [ttlField]: { $exists: true } })
          .limit(10)
          .sort({ [ttlField]: -1 })
          .toArray()
      ]);

      const analysis = {
        totalDocuments: totalCount,
        documentsWithTTLField: documentsWithTTLField,
        documentsWithoutTTLField: nullTTLField,
        recentDocuments: recentDocuments,
        documentsToExpire: expiredDocuments,
        ttlFieldCoverage: totalCount > 0 ? (documentsWithTTLField / totalCount * 100).toFixed(2) : 0,
        sampleDocuments: sampleDocs.map(doc => ({
          id: doc._id,
          ttlValue: doc[ttlField],
          willExpireAt: doc[ttlField] ? new Date(doc[ttlField].getTime() + expireAfterSeconds * 1000) : null
        }))
      };

      // Add warnings and recommendations
      analysis.warnings = [];
      analysis.recommendations = [];

      if (analysis.ttlFieldCoverage < 100) {
        analysis.warnings.push(`${analysis.documentsWithoutTTLField} documents missing TTL field`);
        analysis.recommendations.push('Consider adding TTL field to all documents or handle null values');
      }

      if (analysis.documentsToExpire > 0) {
        analysis.warnings.push(`${analysis.documentsToExpire} documents appear to be past expiration time`);
        analysis.notes = analysis.notes || [];
        analysis.notes.push('TTL cleanup may be in progress or delayed');
      }

      return analysis;
    } catch (error) {
      return {
        error: `Failed to analyze documents: ${error.message}`,
        totalDocuments: 0,
        documentsWithTTLField: 0
      };
    }
  }

  /**
   * Generate recommendations for TTL index optimization
   * @param {Array} ttlIndexes - Array of TTL indexes
   * @param {Object} collectionStats - Collection statistics
   * @returns {Array} Recommendations
   */
  generateTTLRecommendations(ttlIndexes, collectionStats) {
    const recommendations = [];

    if (ttlIndexes.length === 0) {
      return [{
        type: 'info',
        message: 'No TTL indexes found',
        suggestion: 'Consider using TTL indexes for automatic document expiration if applicable'
      }];
    }

    ttlIndexes.forEach(ttlIndex => {
      // Recommendations based on analysis
      if (ttlIndex.analysis.warnings.length > 0) {
        recommendations.push({
          type: 'warning',
          index: ttlIndex.name,
          field: ttlIndex.field,
          message: `TTL index has warnings: ${ttlIndex.analysis.warnings.join(', ')}`,
          suggestions: ttlIndex.analysis.recommendations
        });
      }

      // Performance recommendations
      if (collectionStats && collectionStats.totalIndexSize) {
        const indexSize = collectionStats.indexSizes ? collectionStats.indexSizes[ttlIndex.name] : 0;
        if (indexSize > 0) {
          recommendations.push({
            type: 'info',
            index: ttlIndex.name,
            message: `TTL index size: ${this._formatBytes(indexSize)}`,
            suggestion: 'Monitor index size growth with TTL operations'
          });
        }
      }
    });

    // General TTL recommendations
    recommendations.push({
      type: 'info',
      message: 'TTL index monitoring',
      suggestions: [
        'TTL operations are not reflected in $indexStats',
        'Monitor TTL delete operations via database logs',
        'TTL cleanup runs approximately every 60 seconds',
        'Consider compound indexes if querying by TTL field and other fields'
      ]
    });

    return recommendations;
  }

  /**
   * Format bytes into human-readable format
   * @param {number} bytes - Number of bytes
   * @returns {string} Formatted string
   */
  _formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

module.exports = TTLDetector;
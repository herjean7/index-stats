/**
 * Utility functions for MongoDB index analysis
 */

class Utils {
  /**
   * Format bytes into human-readable format
   * @param {number} bytes - Number of bytes
   * @returns {string} Formatted string
   */
  static formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Format duration from milliseconds to human-readable format
   * @param {number} milliseconds - Duration in milliseconds
   * @returns {string} Formatted duration
   */
  static formatDuration(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Safely parse MongoDB connection string
   * @param {string} connectionString - MongoDB connection string
   * @returns {Object|null} Parsed connection info or null
   */
  static parseConnectionString(connectionString) {
    try {
      const url = new URL(connectionString);
      return {
        protocol: url.protocol,
        username: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
        hostname: url.hostname,
        port: url.port || '27017',
        database: url.pathname.slice(1),
        searchParams: url.searchParams
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Validate MongoDB connection parameters
   * @param {Object} params - Connection parameters
   * @returns {Object} Validation result
   */
  static validateConnectionParams(params) {
    const errors = [];

    if (!params.host) {
      errors.push('Host is required');
    }

    if (!params.port || isNaN(parseInt(params.port))) {
      errors.push('Valid port number is required');
    }

    if (!params.username) {
      errors.push('Username is required');
    }

    if (!params.password) {
      errors.push('Password is required');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Sanitize database/collection names for safe display
   * @param {string} name - Database or collection name
   * @returns {string} Sanitized name
   */
  static sanitizeName(name) {
    if (!name || typeof name !== 'string') {
      return 'Unknown';
    }
    
    // Remove or replace potentially problematic characters
    return name.replace(/[<>:"'/\\|?*\x00-\x1f]/g, '_');
  }

  /**
   * Check if a MongoDB operation is a system operation
   * @param {string} operation - Operation name
   * @returns {boolean} True if system operation
   */
  static isSystemOperation(operation) {
    const systemOps = [
      'serverStatus',
      'listDatabases',
      'listCollections',
      'listIndexes',
      'indexStats',
      'collStats',
      'dbStats'
    ];
    
    return systemOps.includes(operation);
  }

  /**
   * Create a safe timeout promise
   * @param {Promise} promise - Original promise
   * @param {number} timeoutMs - Timeout in milliseconds
   * @param {string} operation - Operation description for error messages
   * @returns {Promise} Promise with timeout
   */
  static withTimeout(promise, timeoutMs, operation = 'Operation') {
    return Promise.race([
      promise,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`${operation} timed out after ${timeoutMs}ms`)), timeoutMs)
      )
    ]);
  }

  /**
   * Retry an async operation with exponential backoff
   * @param {Function} operation - Async operation to retry
   * @param {number} maxRetries - Maximum number of retries
   * @param {number} initialDelayMs - Initial delay in milliseconds
   * @returns {Promise} Promise that resolves with operation result
   */
  static async retry(operation, maxRetries = 3, initialDelayMs = 1000) {
    let lastError;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        if (attempt === maxRetries) {
          throw lastError;
        }
        
        const delay = initialDelayMs * Math.pow(2, attempt);
        await this.sleep(delay);
      }
    }
  }

  /**
   * Sleep for specified milliseconds
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise} Promise that resolves after delay
   */
  static sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Deep merge two objects
   * @param {Object} target - Target object
   * @param {Object} source - Source object
   * @returns {Object} Merged object
   */
  static deepMerge(target, source) {
    const output = Object.assign({}, target);
    
    if (this.isObject(target) && this.isObject(source)) {
      Object.keys(source).forEach(key => {
        if (this.isObject(source[key])) {
          if (!(key in target)) {
            Object.assign(output, { [key]: source[key] });
          } else {
            output[key] = this.deepMerge(target[key], source[key]);
          }
        } else {
          Object.assign(output, { [key]: source[key] });
        }
      });
    }
    
    return output;
  }

  /**
   * Check if value is an object
   * @param {*} item - Item to check
   * @returns {boolean} True if object
   */
  static isObject(item) {
    return item && typeof item === 'object' && !Array.isArray(item);
  }

  /**
   * Generate a unique identifier
   * @param {number} length - Length of identifier
   * @returns {string} Unique identifier
   */
  static generateId(length = 8) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    return result;
  }

  /**
   * Calculate percentage
   * @param {number} value - Value
   * @param {number} total - Total
   * @param {number} decimals - Number of decimal places
   * @returns {string} Formatted percentage
   */
  static calculatePercentage(value, total, decimals = 2) {
    if (total === 0) return '0%';
    
    const percentage = (value / total * 100).toFixed(decimals);
    return `${percentage}%`;
  }

  /**
   * Truncate string with ellipsis
   * @param {string} str - String to truncate
   * @param {number} maxLength - Maximum length
   * @returns {string} Truncated string
   */
  static truncate(str, maxLength) {
    if (!str || str.length <= maxLength) return str;
    return str.substring(0, maxLength - 3) + '...';
  }

  /**
   * Sort array of objects by multiple fields
   * @param {Array} array - Array to sort
   * @param {Array} sortBy - Array of field names with optional direction
   * @returns {Array} Sorted array
   */
  static sortBy(array, sortBy) {
    return array.sort((a, b) => {
      for (const field of sortBy) {
        let fieldName = field;
        let direction = 'asc';
        
        if (typeof field === 'object') {
          fieldName = field.field;
          direction = field.direction || 'asc';
        }
        
        const aVal = this.getNestedProperty(a, fieldName);
        const bVal = this.getNestedProperty(b, fieldName);
        
        let comparison = 0;
        if (aVal > bVal) comparison = 1;
        if (aVal < bVal) comparison = -1;
        
        if (direction === 'desc') comparison *= -1;
        
        if (comparison !== 0) return comparison;
      }
      return 0;
    });
  }

  /**
   * Get nested property from object using dot notation
   * @param {Object} obj - Object to get property from
   * @param {string} path - Dot-separated path to property
   * @returns {*} Property value
   */
  static getNestedProperty(obj, path) {
    return path.split('.').reduce((o, p) => o && o[p], obj);
  }

  /**
   * Group array of objects by specified field
   * @param {Array} array - Array to group
   * @param {string} field - Field to group by
   * @returns {Object} Grouped object
   */
  static groupBy(array, field) {
    return array.reduce((grouped, item) => {
      const key = this.getNestedProperty(item, field);
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(item);
      return grouped;
    }, {});
  }

  /**
   * Remove undefined and null values from object
   * @param {Object} obj - Object to clean
   * @returns {Object} Cleaned object
   */
  static cleanObject(obj) {
    const cleaned = {};
    
    Object.keys(obj).forEach(key => {
      const value = obj[key];
      if (value !== undefined && value !== null) {
        if (this.isObject(value)) {
          const cleanedNested = this.cleanObject(value);
          if (Object.keys(cleanedNested).length > 0) {
            cleaned[key] = cleanedNested;
          }
        } else {
          cleaned[key] = value;
        }
      }
    });
    
    return cleaned;
  }
}

module.exports = Utils;
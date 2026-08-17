const AliCloudClient = require('../alicloud-client');

class AliCloudProvider {
  constructor({ env, options }) {
    this.env = env;
    this.options = options;
  }

  validate() {
    const missing = [];
    if (!this.options.instanceId) {
      missing.push('--instance-id');
    }
    if (!this.env.ALICLOUD_ACCESS_KEY_ID) {
      missing.push('ALICLOUD_ACCESS_KEY_ID');
    }
    if (!this.env.ALICLOUD_ACCESS_KEY_SECRET) {
      missing.push('ALICLOUD_ACCESS_KEY_SECRET');
    }

    if (missing.length > 0) {
      throw new Error(`Missing required AliCloud settings: ${missing.join(', ')}`);
    }
  }

  async resolveTarget() {
    this.validate();

    const client = new AliCloudClient({
      accessKeyId: this.env.ALICLOUD_ACCESS_KEY_ID,
      accessKeySecret: this.env.ALICLOUD_ACCESS_KEY_SECRET,
      region: this.options.region || this.env.ALICLOUD_REGION || 'cn-hangzhou'
    });

    return client.getDBInstanceAttribute(this.options.instanceId);
  }
}

module.exports = AliCloudProvider;
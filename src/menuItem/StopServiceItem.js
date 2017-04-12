/**
 * LINKURIOUS
 * Copyright Linkurious SAS 2012 - 2017
 *
 * - Created by david on 2017-03-01.
 */
'use strict';

const ServiceItem = require('./ServiceItem');

class StopServiceItem extends ServiceItem {

  constructor(serviceName) {
    super('Stop', serviceName);
  }

  /**
   * @returns {string|null}
   */
  suffix() {
    return this.serviceState && this.serviceState.pid !== undefined
      ? `\x1b[32mpid\x1b[0m: ${this.serviceState.pid}`
      : null;
  }

  /**
   * @returns {boolean}
   */
  visible() {
    return  super.visible() && this.serviceState.started;
  }

  /**
   * @returns {Promise}
   */
  action() {
    return this.menu.patty.client.stopService(this._serviceName);
  }
}

module.exports = StopServiceItem;

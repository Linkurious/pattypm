/**
 * LINKURIOUS
 * Copyright Linkurious SAS 2012 - 2017
 *
 * - Created by david on 2017-03-01.
 */
'use strict';

const ServiceItem = require('./ServiceItem');

function red(s) {
  return `\x1b[31m${s}\x1b[0m`;
}

class StartServiceItem extends ServiceItem {

  /**
   * @param {string} serviceName
   */
  constructor(serviceName) {
    super('Start', serviceName);
  }

  /**
   * @returns {string|null}
   */
  suffix() {
    let s = this.serviceState;
    if (!s || !s.exitCode) { return null; }
    return `exit code: ${red(s.exitCode)}` + (
      s.restarts ? `, auto-restarts: ${red(s.restarts)}` : ''
    );
  }

  /**
   * @returns {boolean}
   */
  visible() {
    return super.visible() && !this.serviceState.started;
  }

  /**
   * @returns {Promise}
   */
  action() {
    return this.menu.patty.client.startService(this._serviceName);
  }
}

module.exports = StartServiceItem;

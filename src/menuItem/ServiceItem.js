/**
 * LINKURIOUS
 * Copyright Linkurious SAS 2012 - 2017
 *
 * - Created by david on 2017-03-01.
 */
'use strict';

const MenuItem = require('./MenuItem');
const Utils = require('../Utils');
const Menu = require('../Menu');

class ServiceItem extends MenuItem {

  /**
   * @param {string} action
   * @param {string} serviceName
   */
  constructor(action, serviceName) {
    super(`${action} service: "${serviceName}"`);
    this._serviceName = serviceName;
  }

  /**
   * @returns {boolean}
   */
  visible() {
    return super.visible() &&
      this.menu.state.started &&
      !this.serviceState.disabled &&
      this.serviceState !== null;
  }

  /**
   * @returns {ServiceState|null}
   * @final
   */
  get serviceState() {
    const serviceData = this.menu.state.services
      .find(serviceData => serviceData.name === this._serviceName);
    return serviceData ? serviceData.state : null;
  }

  /**
   * @returns {ServiceOptions|null}
   */
  get serviceOptions() {
    return this.menu.options.services.find(so => so.name === this._serviceName) || null;
  }

  /**
   * @returns {string}
   */
  status() {
    /** @type {ServiceState} */
    let state = this.serviceState;
    let options = this.serviceOptions;
    let msg = `${Menu.colorValue(state.started, 'started', 'stopped')}`;
    if (state.started && state.startTime) {
      msg = msg + ` ${Utils.humanize.relativeTime(state.startTime / 1000)}`;
    }
    if (!state.started && state.stopTime) {
      msg = msg + ` ${Utils.humanize.relativeTime(state.stopTime / 1000)}`;
    }
    if (typeof options.maxRestarts === 'number') {
      msg = msg + ` - auto-restarts: ${state.restarts}/${
          options.maxRestarts === 0 ? 'infinity' : options.maxRestarts}`;
    }
    return msg;
  }
}

module.exports = ServiceItem;

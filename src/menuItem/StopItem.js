/**
 * LINKURIOUS
 * Copyright Linkurious SAS 2012 - 2017
 *
 * - Created by david on 2017-03-01.
 */
'use strict';

const ServicesControlMenuItem = require('./ServicesControlMenuItem');

class StopItem extends ServicesControlMenuItem {

  constructor() {
    super();
  }

  /**
   * @returns {string}
   */
  name() {
    return `Stop ${this.menu.options.name}`;
  }

  /**
   * @returns {string|null}
   */
  suffix() {
    const s = this.startedServices;
    return s > 0 ? `will stop ${s} running service${s > 1 ? 's' : ''}` : null;
  }

  /**
   * @returns {boolean}
   */
  visible() {
    return super.visible() && (this.menu.state.started || this.startedServices > 0);
  }

  /**
   * @returns {Promise}
   */
  action() {
    return this.menu.patty.ensureStopped();
  }

  /**
   * @returns {string}
   */
  status() {
    return 'stop the manager' + (this.startedServices > 0
      ? ` and ${this.startedServices} service${this.startedServices > 1 ? 's' : ''}`
      : ''
    );
  }
}

module.exports = StopItem;

/**
 * LINKURIOUS
 * Copyright Linkurious SAS 2012 - 2017
 *
 * - Created by david on 2017-03-01.
 */
'use strict';

const ServicesControlMenuItem = require('./ServicesControlMenuItem');

class StartItem extends ServicesControlMenuItem {

  constructor() {
    super();
  }

  /**
   * @returns {boolean}
   * @private
   */
  get started() {
    return this.menu.state.started;
  }

  /**
   * @returns {string}
   */
  name() {
    return `Start ${this.menu.options.name}`;
  }

  /**
   * @returns {string|null}
   */
  suffix() {
    const s = this.stoppedServices;
    return this.menu.state.started && s > 0
      ? `will start ${s} stopped service${s > 1 ? 's' : ''}`
      : null;
  }

  /**
   * @returns {boolean}
   */
  visible() {
    return super.visible() && (!this.started || this.stoppedServices > 0);
  }

  /**
   * @returns {Promise}
   */
  action() {
    return this.menu.patty.ensureStarted().then(() => this.menu.patty.client.startServices());
  }

  /**
   * @returns {string}
   */
  status() {
    return `start ${
      this.started ? '' : 'the manager and '
    }${this.stoppedServices} service${this.stoppedServices > 1 ? 's' : ''}` + (
        this.menu.state.processOwner ? ` as user "${this.menu.state.processOwner}"` : ''
    );
  }
}

module.exports = StartItem;

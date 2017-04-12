/**
 * LINKURIOUS
 * Copyright Linkurious SAS 2012 - 2017
 *
 * - Created by david on 2017-03-01.
 */
'use strict';

const MenuItem = require('./MenuItem');

class InstallItem extends MenuItem {

  constructor() {
    super();
  }

  /**
   * @returns {string}
   */
  name() {
    return `Install ${this.menu.options.name} as a system service`;
  }

  /**
   * @returns {string|null}
   */
  suffix() {
    return this.menu.state.started ? 'will restart' : null;
  }

  /**
   * @returns {boolean}
   */
  visible() {
    return super.visible() && !this.menu.state.installed;
  }

  /**
   * @returns {Promise}
   */
  action() {
    return this.menu.patty.ensureInstalled();
  }

  /**
   * @returns {string}
   */
  status() {
    return `Install ${this.menu.options.name} as a service using ${
      this.menu.patty.serviceSystem}` + (
      this.menu.state.processOwner ? ` (as user "${this.menu.state.processOwner}")` : ''
    );
  }
}

module.exports = InstallItem;

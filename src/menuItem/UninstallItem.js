/**
 * LINKURIOUS
 * Copyright Linkurious SAS 2012 - 2017
 *
 * - Created by david on 2017-03-01.
 */
'use strict';

const MenuItem = require('./MenuItem');

class UninstallItem extends MenuItem {

  constructor() {
    super();
  }

  /**
   * @returns {string}
   */
  name() {
    return `Uninstall ${this.menu.options.name} from system services`;
  }

  /**
   * @returns {string|null}
   */
  suffix() {
    return this.menu.state.started ? 'will stop' : null;
  }

  /**
   * @returns {boolean}
   */
  visible() {
    return super.visible() && this.menu.state.installed;
  }

  /**
   * @returns {Promise}
   */
  action() {
    return this.menu.patty.ensureUninstalled();
  }

  /**
   * @return {string|null}
   */
  status() {
    return `Uninstall ${this.menu.options.name} from system services (installed with ${
      this.menu.patty.serviceSystem})`;
  }
}

module.exports = UninstallItem;

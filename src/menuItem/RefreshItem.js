/**
 * LINKURIOUS
 * Copyright Linkurious SAS 2012 - 2017
 *
 * - Created by david on 2017-03-01.
 */
'use strict';

const MenuItem = require('./MenuItem');

class RefreshItem extends MenuItem {

  constructor() {
    super();
  }

  /**
   * @returns {string}
   */
  name() {
    return 'Refresh status info';
  }

  /**
   * @returns {boolean}
   */
  visible() {
    return super.visible();
  }

  /**
   * @returns {Promise}
   */
  action() {
    return this.menu.update();
  }
}

module.exports = RefreshItem;

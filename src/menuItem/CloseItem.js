/**
 * LINKURIOUS
 * Copyright Linkurious SAS 2012 - 2017
 *
 * - Created by david on 2017-03-01.
 */
'use strict';

const MenuItem = require('./MenuItem');

class CloseItem extends MenuItem {

  constructor() {
    super('Leave this menu');
  }

  /**
   * @returns {Promise<void>}
   */
  action() {
    process.exit(0);
    return Promise.resolve();
  }
}

module.exports = CloseItem;

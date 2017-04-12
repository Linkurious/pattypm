/**
 * LINKURIOUS
 * Copyright Linkurious SAS 2012 - 2017
 *
 * - Created by david on 2017-03-01.
 */
'use strict';

const MenuItem = require('./MenuItem');

class SeparatorItem extends MenuItem {

  /**
   * @param {function():boolean} [visibleFn]
   */
  constructor(visibleFn) {
    super('- - -');
    this._visibleFn = visibleFn ? visibleFn : () => true;
  }

  visible() {
    return super.visible() && this._visibleFn();
  }

  suffix() {
    return null;
  }
}

module.exports = SeparatorItem;

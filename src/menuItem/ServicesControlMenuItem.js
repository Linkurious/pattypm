/**
 * LINKURIOUS
 * Copyright Linkurious SAS 2012 - 2017
 *
 * - Created by david on 2017-03-27.
 */
'use strict';

const MenuItem = require('./MenuItem');

class ServicesControlMenuItem extends MenuItem {

  /**
   * @inheritdoc
   */
  constructor(name) {
    super(name);
  }

  /**
   * @returns {number}
   */
  get stoppedServices() {
    return this.menu.state.started
      ? this.menu.state.services.filter(s => !s.state.disabled && !s.state.started).length
      : this.menu.options.services.filter(so => !so.disabled).length;
  }

  /**
   * @returns {number}
   */
  get startedServices() {
    return this.menu.state.started
      ? this.menu.state.services.filter(s => s.state.started).length
      : 0;
  }

}

module.exports = ServicesControlMenuItem;

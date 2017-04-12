/**
 * LINKURIOUS
 * Copyright Linkurious SAS 2012 - 2017
 *
 * - Created by david on 2017-03-06.
 */
'use strict';

const Logger = require('./Logger');

class ClientLogger extends Logger {
  /**
   * @param {PattyHome} home
   * @param {PattyOptions} options
   */
  constructor(home, options) {
    super(home, options, options.name + ' manager client', true);
  }
}

module.exports = ClientLogger;

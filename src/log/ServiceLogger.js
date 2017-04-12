/**
 * LINKURIOUS
 * Copyright Linkurious SAS 2012 - 2017
 *
 * - Created by david on 2017-02-10.
 */
'use strict';

const Logger = require('./Logger');

class ServiceLogger extends Logger {

  /**
   * @param {ServerLogger} serverLogger
   * @param {string} serviceName
   */
  constructor(serverLogger, serviceName) {
    super(serverLogger.home, serverLogger.options, serviceName);
  }

}

module.exports = ServiceLogger;

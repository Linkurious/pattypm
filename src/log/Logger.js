/**
 * LINKURIOUS
 * Copyright Linkurious SAS 2012 - 2017
 *
 * - Created by david on 2017-03-06.
 */
'use strict';

// builtin
const path = require('path');

// dependencies
const log4js = require('log4js');

// local
const Utils = require('../Utils');
const PattyError = require('../PattyError');

class Logger {
  /**
   * @param {PattyHome} home
   * @param {PattyOptions} options
   * @param {string} logName
   * @param {boolean} [disableConsole=false]
   */
  constructor(home, options, logName, disableConsole) {
    this.home = home;
    this.options = options;
    this.logPath = path.resolve(home.dir, 'logs');
    this.logName = Logger.fixName(logName);
    this._logger = undefined;
    this._initialized = false;
    this._maxLogSize = options.maxLogSize || 5 * 1024 * 1024;
    this._maxLogFiles = options.maxLogFiles || 10;
    this._disableConsole = disableConsole;
  }

  /**
   * @returns {boolean}
   */
  get initDone() {
    return this._initialized;
  }

  /**
   * @param {string} serviceName
   * @returns {string}
   */
  static fixName(serviceName) {
    return serviceName.toLowerCase().replace(/[^a-z0-9.]/g, '-');
  }

  /**
   * @returns {Promise}
   */
  init() {
    return Utils.ensureDir(this.logPath).then(() => {

      // create the appender
      log4js.loadAppender('file');
      const appender = log4js.appenderMakers.file({
        filename: this.logName + '.log',
        maxLogSize: this._maxLogSize,
        backups: this._maxLogFiles,
        layout: {type: 'pattern', pattern: '%d{ISO8601} %p %m'},
        timezoneOffset: 0
      }, {cwd: this.logPath});

      // create the logger
      this._logger = log4js.getLogger(this.logName);
      if (this._disableConsole) {
        this._logger.removeAllListeners('log');
      }

      // add the appender to the logger
      log4js.addAppender(appender, this.logName);

      this.setLevel('DEBUG');
      this._initialized = true;
    });
  }

  /**
   * @param {string} level
   */
  setLevel(level) {
    this._logger.setLevel(level);
  }

  /**
   * @param {string} msg
   */
  debug(msg) {
    this._logger.debug(msg);
  }

  /**
   * @param {string} msg
   */
  info(msg) {
    this._logger.info(msg);
  }

  /**
   * @param {string} msg
   */
  warn(msg) {
    this._logger.warn(msg);
  }

  /**
   * @param {string} msg
   * @param {Error} [error]
   */
  error(msg, error) {
    if (error) {
      const pe = PattyError.other(msg, error);
      this._logger.error(pe.fullMessage);
      this._logger.error(pe.fullStack);
    } else {
      this._logger.error(msg);
    }
  }
}

module.exports = Logger;

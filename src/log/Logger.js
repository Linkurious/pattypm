/**
 * LINKURIOUS
 * Copyright Linkurious SAS 2012 - 2017
 *
 * - Created by david on 2017-03-06.
 */
'use strict';

// builtin
const path = require('node:path');

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

      // configure a multi-file appender with fileName based on the logger name (categoryName)
      // log4js.configure() could be called several times, but always with the same config.
      const log4jsConfig = {
        appenders: {
          file: {
            type: 'multiFile',
            base: this.logPath,
            extension: '.log',
            property: 'categoryName',
            maxLogSize: this._maxLogSize,
            backups: this._maxLogFiles,
            layout: {type: 'pattern', pattern: '%d{ISO8601_WITH_TZ_OFFSET} %p %m'}
          },
          console: {
            type: 'console'
          }
        },
        categories: {
          default: {
            appenders: this._disableConsole ? ['file'] : ['file', 'console'],
            level: 'DEBUG'
          }
        }
      };
      log4js.configure(log4jsConfig);

      // create the logger (`logName` will be used as the basename for the log file)
      this._logger = log4js.getLogger(this.logName);

      this._initialized = true;
    });
  }

  /**
   * Flush the logs and close the logger.
   *
   * @returns {Promise<void>}
   */
  close() {
    if (!this._logger) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this._logger.shutdown(() => {
        resolve();
      });
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

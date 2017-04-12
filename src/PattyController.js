/**
 * LINKURIOUS
 * Copyright Linkurious SAS 2012 - 2017
 *
 * - Created by david on 2017-02-09.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const Promise = require('bluebird');

const Utils = require('./Utils');
const PattyError = require('./PattyError');
const PattyService = require('./PattyService');
const ServiceLogger = require('./log/ServiceLogger');

class PattyController {

  /**
   * @param {PattyHome} home
   * @param {PattyOptions} options
   * @param {ServerLogger} logger
   */
  constructor(home, options, logger) {

    /** @type {PattyHome} */
    this.home = home;

    /** @type {PattyOptions} */
    this.options = options;

    /** @type {Map<string, PattyService>} */
    this.services = new Map();

    /** @type {ServerLogger} */
    this._logger = logger;

    // exit handlers

    process.on('beforeExit', () => this._exitHandler());

    process.on('uncaughtException', (e) => {
      if (this._logger.initDone) {
        this._logger.error('uncaught exception', e);
      }
      this._exitHandler();
    });

    process.on('SIGINT', () => {
      if (this._logger.initDone) {
        this._logger.warn('received signal "SIGINT"');
      }
      this._exitHandler().finally(() => this.kill({}));
    });
  }

  /**
   * @returns {Promise}
   * @private
   */
  _exitHandler() {
    try {
      this._logger.info('cleanup before exit');
      return this.stopServices({}).catch(e => {
        this._logger.error('cleanup failed', e);
      });
    } catch(e) {
      this._logger.error('cleanup failed', e);
      return Promise.resolve();
    }
  }

  /**
   * @returns {Promise}
   */
  $start() {
    return Promise.map(this.options.services, serviceOptions => {
      return this.addService(serviceOptions);
    }, {concurrency: 1});
  }

  /**
   * @return {PattyOptions}
   */
  $getOptions() {
    const options = Utils.clone(this.options);
    options.services = Array.from(this.services.values()).map(service => service.options);
    delete options.version;
    return options;
  }

  /**
   * @returns {Promise}
   */
  saveConfig() {
    const options = this.$getOptions();
    return Utils.writeFile(Utils.getConfigPath(this.home), JSON.stringify(options, null, '  '));
  }

  /**
   * @param {ServiceOptions} options
   * @returns {Promise}
   */
  addService(options) {
    Utils.check.properties('options', options, Utils.SERVICE_OPTIONS_PROPERTIES(this.home));

    if (this.services.has(options.name)) {
      return PattyError.businessP('A service with this name already exists');
    }

    const serviceLogger = new ServiceLogger(this._logger, options.name);
    this.services.set(options.name, new PattyService(this.home, options, serviceLogger));

    return this.saveConfig().then(() =>  serviceLogger.init());
  }

  /**
   *
   * @param options
   * @return {PattyOptions}
   */
  getOptions(options) {
    this._emptyOptions(options);
    return this.$getOptions();
  }

  /**
   * @param {ServiceOptions} options
   * @returns {Promise}
   */
  updateService(options) {
    Utils.check.properties('options', options, Utils.SERVICE_OPTIONS_PROPERTIES(this.home));

    if (!this.services.has(options.name)) {
      return PattyError.businessP('Service not found');
    }

    this.services.get(options.name).options = options;
    return this.saveConfig();
  }

  /**
   * @param {object} options
   * @param {string} options.name
   * @param {boolean} options.force
   */
  removeService(options) {
    return this.stopService(options).then(() => {
      this.services.delete(options.name);
    });
  }

  /**
   * @returns {string[]}
   */
  getServices() {
    return Array.from(this.services.keys());
  }

  /**
   * @param {object} options
   * @param {string} options.name
   */
  getService(options) {
    const service = this._service(options);
    return {
      options: service.options,
      state: service.state
    };
  }

  /**
   * @param {object} options
   * @param {string} options.name
   * @returns {Promise<number>} PID
   */
  startService(options) {
    const s = this._service(options);
    return s.start().catch(err => {
      return PattyError.otherP(`Service ${options.name} could not be started`, err);
    });
  }

  /**
   * @param {object} options
   * @returns {Promise<number[]>} PIDs
   */
  startServices(options) {
    this._emptyOptions(options);

    return Promise.map(
      Array.from(this.services.values()),
      /** @param {PattyService} service */
      (service) => {
        return service.start().catch(e => {
          return PattyError.otherP(`Could not start service "${service.options.name}"`, e);
        });
      },
      {concurrency: 1}
    ).filter(n => typeof n === 'number');
  }

  /**
   * @param {object} options
   * @returns {Promise}
   */
  stopServices(options) {
    this._emptyOptions(options);

    return Promise.map(
      Array.from(this.services.values()),
      /** @param {PattyService} service */ (service) => {
        return service.stop();
      }
    );
  }

  /**
   * @param {object} options
   * @param {string} options.name
   * @returns {Promise}
   */
  stopService(options) {
    Utils.check.properties('options', options, {
      name: {required: true, check: 'nonEmpty'},
      force: {type: 'boolean'}
    });

    const s = this._service(options);
    return s.stop();
  }

  /**
   * @returns {{name: string, state: ServiceState}}
   */
  getServicesState(options) {
    this._emptyOptions(options);

    return Array.from(this.services.values()).map(/** @param {PattyService} s */(s) => ({
      name: s.options.name,
      state: s.state
    }));
  }

  /**
   * @params {object} options
   * @returns {boolean}
   */
  kill(options) {
    this._emptyOptions(options);

    this._logger.info('goodbye');
    setTimeout(() => { process.exit(0); }, 1);
    return true;
  }

  /**
   * @params {object} options
   * @returns {number}
   */
  ping(options) {
    this._emptyOptions(options);

    return Date.now();
  }

  /**
   * @param {object} options
   * @param {string} options.name
   * @param {boolean} [noCheck=false] skip checking options
   * @returns {PattyService}
   * @throws {PattyError} if the service does not exist
   * @private
   */
  _service(options, noCheck) {
    if (!noCheck) {
      Utils.check.properties('options', options, {
        name: {required: true, check: 'nonEmpty'}
      });
    }

    const service = this.services.get(options.name);
    if (!service) {
      throw PattyError.business('Service not found');
    }
    return service;
  }

  /**
   * @param {object} options
   * @throws {PattyError} if the options are not empty
   * @private
   */
  _emptyOptions(options) {
    Utils.check.properties('options', options, {});
  }

}

module.exports = PattyController;


/**
 * INSTALL AS A SERVICE (windows)
 *
 * Winser:
 * https://github.com/jfromaniello/winser
 * uses http://nssm.cc/download (last-commit: 2016-09-11, last-release: 2014-08-31)
 *
 * Node-Windows
 * https://github.com/coreybutler/node-windows
 * uses https://github.com/kohsuke/winsw (last commit: 2017-01-08, last-release: 2017-01-08)
 */

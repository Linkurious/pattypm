/**
 * LINKURIOUS
 * Copyright Linkurious SAS 2012 - 2017
 *
 * - Created by david on 2017-02-09.
 */
'use strict';

const Utils = require('./Utils');
const PattyError = require('./PattyError');
const PattyService = require('./PattyService');
const ServiceLogger = require('./log/ServiceLogger');

class PattyController {

  /**
   * @param {PattyHome} home
   * @param {PattyOptions} options
   * @param {ServerLogger} logger
   * @param {function} exitHandler
   */
  constructor(home, options, logger, exitHandler) {

    /** @type {PattyHome} */
    this.home = home;

    /** @type {PattyOptions} */
    this.options = options;
    this.exitHandler = exitHandler;

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
   * Stops services & calls this.existHandler.
   * Cannot reject (will log errors).
   *
   * @returns {Promise}
   * @private
   */
  _exitHandler() {
    try {
      this._logger.info('cleanup before exit');
      return this.stopServices({}).catch(e => {
        this._logger.error('service cleanup failed', e);
      }).then(() => {
        if (this.exitHandler) {
          // used to stop the http server
          this.exitHandler();
        }
      }).catch((e) => {
        this._logger.error('server cleanup failed', e);
      });
    } catch(e) {
      this._logger.error('cleanup failed', e);
      return Promise.resolve();
    }
  }

  /**
   * @returns {Promise}
   */
  async $start() {
    for (const serviceOptions of this.options.services) {
      await this.addService(serviceOptions);
    }
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
   * @returns {Promise<void>}
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
  async startServices(options) {
    this._emptyOptions(options);

    const processIds = [];
    for (const service of this.services.values()) {
      const pid = await service.start().catch(e => {
        return PattyError.otherP(`Could not start service "${service.options.name}"`, e);
      });
      if (typeof pid === 'number') {
        processIds.push(pid);
      }
    }
    return processIds;
  }

  /**
   * @param {object} options
   * @param {boolean} [options.force]
   * @returns {Promise<void>}
   */
  async stopServices(options) {
    Utils.check.properties('options', options, {
      force: {type: 'boolean'}
    });

    for (const service of this.services.values()) {
      if (options.force) {
        await service.kill();
      } else {
        await service.stop();
      }
    }
  }

  /**
   * @param {object} options
   * @param {string} options.name
   * @param {string} [options.force]
   * @returns {Promise}
   */
  stopService(options) {
    Utils.check.properties('options', options, {
      name: {required: true, check: 'nonEmpty'},
      force: {type: 'boolean'}
    });

    const s = this._service(options);
    return options.force ? s.kill() : s.stop();
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
    setTimeout(() => {
      this._exitHandler().catch(() => {
        // ignore exitHandler errors
      }).then(() => {
        this._logger.info('goodbye');
        // flush logs to files
        return this._logger.close();
      }).finally(() => {
        // stop the process with exit code 0 (non-error exit)
        // we keep a 100ms delay because apparently logger.close does not completely flush logs
        setTimeout(() => process.exit(0), 100);
      });
    }, 1);
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

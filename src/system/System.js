/**
 * LINKURIOUS
 * Copyright Linkurious SAS 2012 - 2017
 *
 * - Created by david on 2017-02-15.
 */
'use strict';

// builtin
const path = require('path');
// local
const PattyError = require('../PattyError');
const Utils = require('../Utils');

class System {

  /**
   * @param {PattyHome} home
   * @param {PattyOptions} options
   * @param {ClientLogger} logger
   * @protected
   */
  constructor(home, options, logger) {
    this.home = home;
    this.options = options;

    /** @type {ClientLogger} */
    this._logger = logger;

    /** @type {string} */
    this._logPath = path.resolve(this.home.dir, 'logs');

    /** @type {object} */
    this._vars = this._makeTemplateVars();
  }

  /**
   * @returns {{
   *   label: string,
   *   name: string,
   *   node_path: string,
   *   ppm_client_path,
   *   ppm_server_path,
   *   ppm_home_path: string,
   *   username: string
   * }}
   * @private
   */
  _makeTemplateVars() {
    return {
      'label': this.options.name.toLowerCase().replace(/[^a-z]/g, '').substr(0, 16),
      'name': this.options.name,
      'description': this.options.description,
      'node_path': process.argv[0] + '',
      'ppm_client_path': path.resolve(__dirname, '..', '..', 'bin', 'client.js'),
      'ppm_server_path': path.resolve(__dirname, '..', '..', 'bin', 'server.js'),
      'ppm_config_path': Utils.getConfigPath(this.home),
      'ppm_home_path': path.resolve(this.home.dir),
      'username': this.options.processOwner || ''
    };
  }

  /**
   * @param {string} actionName
   * @returns {Promise.<undefined|PattyError>}
   */
  checkAdmin(actionName) {
    const msg = 'You need administrator access to ' + actionName;

    return this.isAdmin().then(isAdmin => {
      if (!isAdmin) {
        return PattyError.businessP(msg);
      }
    });
  }

  /**
   * @returns {Promise}
   */
  init() {
    return this._ensureLogs();
  }

  /**
   * @returns {Promise}
   * @private
   */
  _ensureLogs() {
    return Utils.ensureDir(this._logPath);
  }

  /**
   * @returns {Promise}
   */
  install() {
    return this.checkAdmin(`install ${this.options.name} as a system service`).then(() => {
      this._logger.info(`Installing as a system service (${JSON.stringify(this._vars)})...`);
      return this.$install();
    }).then(() => {
      this._logger.info('Installed as a system service (done).');
    });
  }

  /**
   * @returns {Promise}
   */
  uninstall() {
    return this.checkAdmin(`uninstall ${this.options.name} from system services`).then(() => {
      this._logger.info(`Uninstalling from system services...`);
      return this.$uninstall();
    }).then(() => {
      this._logger.info('Uninstalled from system services (done).');
    });
  }

  /**
   * @returns {Promise}
   */
  start() {
    return this.checkAdmin(`start the ${this.options.name} system service`).then(() => {
      this._logger.info(`Starting system service...`);
      return this.$start();
    }).then(() => {
      this._logger.info('Started system service (done).');
    });
  }

  /**
   * @returns {Promise}
   */
  stop() {
    return this.checkAdmin(`stop the ${this.options.name} system service`).then(() => {
      this._logger.info(`Stopping system service...`);
      return this.$stop();
    }).then(() => {
      this._logger.info('Stopped system service (done).');
    });
  }

  /**
   * @returns {Promise.<boolean>}
   * @abstract
   */
  isInstalled() {}

  /**
   * @returns {Promise}
   * @abstract
   */
  $install() {}

  /**
   * @returns {Promise}
   * @abstract
   */
  $uninstall() {}

  /**
   * @returns {Promise}
   * @abstract
   */
  $start() {}

  /**
   * @returns {Promise}
   * @abstract
   */
  $stop() {}

  /**
   * @returns {Promise.<boolean>}
   * @abstract
   */
  isAdmin() {}

  /**
   * @return {string}
   * @abstract
   */
  getServiceSystem() {}

  /**
   * @param {PattyHome} home
   * @param {PattyOptions} options
   * @param {ClientLogger} logger
   * @returns {System}
   */
  static makePlatformSpecific(home, options, logger) {
    const platform = process.platform;
    if (platform === 'linux' || platform === 'darwin') {
      const UnixSystem = require('./UnixSystem');
      return new UnixSystem(home, options, logger);
    } else if (platform === 'win32') {
      const WindowsSystem = require('./WindowsSystem');
      return new WindowsSystem(home, options, logger);
    } else {
      throw new Error('No system module for platform "' + platform + '"');
    }
  }
}

module.exports = System;

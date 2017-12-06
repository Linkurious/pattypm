/**
 * LINKURIOUS
 * Copyright Linkurious SAS 2012 - 2017
 *
 * Created by david on 2017-02-15.
 * Original code and templates by Guillaume Ceccarelli
 */
'use strict';

// builtin
const path = require('path');
// dependencies
const Promise = require('bluebird');
// local
const System = require('./System');
const Utils = require('../Utils');
const PattyError = require('../PattyError');

/*
 * We support 3 init systems on Linux:
 * - LaunchD (Mac OSX)
 * - OpenRC (Gentoo)
 * - SystemD (Found in lot of distributions)
 * - SystemV (Found in most distributions)
 */

/**
 * @typedef {object} SMConfig
 * @property {string} name Human readable name of the system
 * @property {string} template Name of the service file template (in ./templates)
 * @property {string} scriptTarget Template of path to write the service file to
 * @property {number} mode Access flags to set on the service file after creation
 * @property {string|null} startCommand Called to start the service
 * @property {string|null} stopCommand Called to stop the service
 * @property {string} installCommand Called to install the service
 * @property {string} uninstallCommand Called to uninstall the service
 * @property {string|null} postUninstallCommand Called after the service file is deleted
 */

/**
 * @type {{openrc: SMConfig, systemd: SMConfig, systemv: SMConfig, launchd: SMConfig}}
 */
const CONFIG = {

  openrc: {
    name: 'OpenRC',
    template: 'openrc.sh',
    scriptTarget: '/etc/init.d/{{label}}',
    mode: 0o755,

    startCommand: '/etc/init.d/{{label}} start',
    stopCommand: '/etc/init.d/{{label}} stop',

    installCommand: 'rc-update add {{label}} default',
    uninstallCommand: 'rc-update del {{label}} default',
    postUninstallCommand: null
  },

  /* Systemd doc:
   * https://www.digitalocean.com/community/tutorials/understanding-systemd-units-and-unit-files
   * https://www.digitalocean.com/community/tutorials/systemd-essentials-working-with-services-units-and-the-journal
   */
  systemd: {
    name: 'Systemd',
    template: 'systemd.service',
    scriptTarget: '/lib/systemd/system/{{label}}.service',
    mode: 0o644,

    startCommand: 'systemctl start {{label}}',
    stopCommand: 'systemctl stop {{label}}',

    installCommand: 'systemctl daemon-reload; systemctl enable {{label}}',
    uninstallCommand: 'systemctl disable {{label}}',
    postUninstallCommand: 'systemctl daemon-reload'
  },

  systemv: {
    name: 'SystemV',
    template: 'systemv.sh',
    scriptTarget: '/etc/init.d/{{label}}',
    mode: 0o755,

    startCommand: '/etc/init.d/{{label}} start',
    stopCommand: '/etc/init.d/{{label}} stop',

    installCommand:
    '(for x in 2 3 4 5 ; do ln -s /etc/init.d/{{label}} /etc/rc$x.d/S80{{label}} ; done) ; ' +
    '(for x in 0 1 6 ; do ln -s /etc/init.d/{{label}} /etc/rc$x.d/K80{{label}} ; done) ; ' +
    '(/sbin/insserv {{label}} || /usr/lib/insserv/insserv {{label}} || echo -n "")',
    uninstallCommand:
    '(for x in 0 1 6 ; do rm /etc/rc$x.d/K80{{label}} ; done) ; ' +
    '(for x in 2 3 4 5 ; do rm /etc/rc$x.d/S80{{label}} ; done) ; ' +
    '(/sbin/insserv -r {{label}} || /usr/lib/insserv/insserv -r {{label}} || echo -n "")',
    postUninstallCommand: null
  },

  launchd: {
    name: 'Launchd',
    template: 'launchd.plist',
    scriptTarget: '/Library/LaunchDaemons/{{label}}.service.plist',
    mode: 0o644,

    // todo: implement "stop" (using "launchctl kill {{label}}") to enable "restart" commands
    startCommand: null,
    stopCommand: null,

    installCommand: 'launchctl load -w /Library/LaunchDaemons/{{label}}.service.plist',
    // unlike "unload", "remove" works even when the plist file has been deleted
    uninstallCommand: '(launchctl remove {{label}}.service ; echo 1)',
    postUninstallCommand: null
  }
};

class UnixSystem extends System {

  /**
   * @param {PattyHome} home
   * @param {PattyOptions} options
   * @param {ClientLogger} logger
   * @protected
   */
  constructor(home, options, logger) {
    super(home, options, logger);

    /** @type {SMConfig} */
    this._config = undefined;
  }

  /**
   * @returns {Promise}
   */
  init() {
    return UnixSystem._getApplicableConfig().then(config => {
      this._config = config;

      for (let key of Object.keys(this._config)) {
        this._config[key] = Utils.renderMoustache(this._config[key], this._vars);
      }
    });
  }

  /**
   * @return {string}
   */
  getServiceSystem() {
    return this._config ? this._config.name : 'unknown';
  }

  /**
   * @returns {Promise.<boolean>}
   */
  isInstalled() {
    return Utils.canReadFile(this._config.scriptTarget);
  }

  /**
   * @returns {Promise}
   */
  $install() {
    if (!this._vars.username) {
      return PattyError.businessP(
        'Cannot install as a service: the process owner must be set'
      );
    }
    return this._createScript().then(() => {
      return Utils.exec(this._config.installCommand);
    });
  }

  /**
   * @returns {Promise}
   */
  $uninstall() {
    return Utils.exec(this._config.uninstallCommand).then(() => {
      return Utils.canReadFile(this._config.scriptTarget);
    }).then(exists => {
      if (exists) {
        return Utils.unlink(this._config.scriptTarget);
      }
    }).then(() => {
      if (this._config.postUninstallCommand) {
        return Utils.exec(this._config.postUninstallCommand);
      }
    });
  }

  /**
   * @returns {Promise}
   */
  $start() {
    if (!this._config.startCommand) {
      return Promise.resolve();
    }
    return Utils.exec(this._config.startCommand, {timeout: 5000});
  }

  /**
   * @returns {Promise}
   */
  $stop() {
    if (!this._config.stopCommand) {
      return Promise.resolve();
    }
    return Utils.exec(this._config.stopCommand);
  }

  /**
   * @returns {Promise.<boolean>}
   */
  isAdmin() {
    return Promise.resolve(process.getuid() === 0);
  }

  // private

  /**
   * @returns {Promise}
   * @private
   */
  _createScriptContent() {
    const templatePath = path.resolve(__dirname, 'template', this._config.template);
    return Utils.readFile(templatePath).then(template => {
      return Utils.renderMoustache(template, this._vars);
    });
  }

  /**
   * @returns {Promise}
   * @private
   */
  _createScript() {
    return this._createScriptContent().then(scriptContent => {
      return Utils.writeFile(this._config.scriptTarget, scriptContent, this._config.mode);
    });
  }

  /**
   * @returns {Promise.<SMConfig>}
   * @private
   */
  static _getApplicableConfig() {
    if (process.platform === 'darwin') {
      return Promise.resolve(CONFIG.launchd);
    }
    return UnixSystem._hasSystemd().then(systemd => {
      if (systemd) {
        return CONFIG.systemd;
      }
      return UnixSystem._isGentoo().then(gentoo => {
        if (gentoo) {
          return CONFIG.openrc;
        } else {
          // Assume SystemV compatibility
          return CONFIG.systemv;
        }
      });
    });
  }

  /**
   * @returns {Promise.<boolean>}
   * @private
   */
  static _isGentoo() {
    return Utils.canReadFile('/etc/gentoo-release');
  }

  /**
   * @returns {Promise.<boolean>}
   * @private
   */
  static _hasSystemd() {
    return Utils.exec('systemd --version').then(std => !!std.out.length).catch(() => false);
  }

}

module.exports = UnixSystem;

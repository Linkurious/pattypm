/**
 * LINKURIOUS
 * Copyright Linkurious SAS 2012 - 2017
 *
 * - Created by david on 2017-02-15.
 */
'use strict';

// builtin
const path = require('path');
// dependencies
const Promise = require('bluebird');
const fs = require('fs-extra');
// local
const System = require('./System');
const PattyServer = require('../PattyServer');
const PattyError = require('../PattyError');
const Utils = require('../Utils');

const SCRIPT_TEMPLATE_PATH = path.resolve(__dirname, 'template', 'win32.xml');
const ELEVATE_PATH = path.resolve(__dirname, 'win32', 'elevate.cmd');
const WINSW_PATH = path.resolve(__dirname, 'win32', 'winsw.exe');
const WINSW_CONFIG_PATH = path.resolve(__dirname, 'win32', 'winsw.exe.config');

class WindowsSystem extends System {

  /**
   * @param {PattyHome} home
   * @param {PattyOptions} options
   * @param {ClientLogger} logger
   */
  constructor(home, options, logger) {
    super(home, options, logger);

    /** @type {string} */
    this._daemonPath = path.resolve(this.home.dir, 'daemon');

    /** @type {string} */
    this._exeTarget = path.resolve(this._daemonPath, this._vars.label + '.exe');

    /** @type {object<string>} */
    this._networkMapping = {};
  }

  /**
   * @returns {Promise}
   */
  init() {
    return super.init().then(() => {

      // extract network drives mapping
      return Utils.run('net.exe', ['use']).catch(e => {
        // if running "net use" fails, skip silently (resolving network-mapped drives is not mandatory)
        this._logger.warn('Could resolve mapped drives ("net.exe use"). Error: ' + e.message);
        return {out: ''};
      }).then(std => {
        let m;
        std.out.trim().split('\r\n').splice(6).map(line => {
          if ((m = /^\s*([A-Z]:)\s+(\\\\[^\s]+).*$/.exec(line)) !== null) {
            this._networkMapping[m[1]] = m[2];
          }
        });
      }).then(() => {

        // fix network drive paths in _vars
        Object.keys(this._vars).forEach(k => {
          if (k.indexOf('_path') < 0) { return; }
          let pathValue = this._vars[k];
          Object.keys(this._networkMapping).forEach(drive => {
            if (pathValue.indexOf(drive) !== 0) { return; }
            // path belongs to drive
            pathValue = pathValue.replace(drive, this._networkMapping[drive]);
            this._vars[k] = pathValue;
          });
        });
      });
    });
  }

  /**
   * @return {string|null}
   */
  getServiceSystem() {
    return 'Service Control Manager';
  }

  /**
   * @returns {Promise<boolean>}
   */
  isInstalled() {
    /*
    todo: investigate this option and its compatibility across Windows versions
     @echo off
     SC QUERY my_service_name > NUL
     IF ERRORLEVEL 1060 GOTO MISSING
     ECHO EXISTS
     GOTO END

     :MISSING
     ECHO SERVICE MISSING

     :END
     */
    return Utils.canReadFile(this._daemonPath);
  }

  /**
   * @returns {Promise.<boolean>} true if installed, false if already installed
   */
  $install() {
    return this._createDaemon().then(() => this._install());
  }

  /**
   * @returns {Promise}
   */
  $uninstall() {
    return this._uninstall().then(() => this._deleteDaemon());
  }

  /**
   * @returns {Promise}
   */
  $start() {
    return WindowsSystem.runElevated('net.exe', ['start', this._vars.label + '.exe'])
      .return(true)
      .catch(error => {
        if (error.code === 2 && error.message.indexOf('already been started') >= 0) {
          return false;
        }
        return Promise.reject(error);
      });
  }

  /**
   * @returns {Promise}
   */
  $stop() {
    return WindowsSystem.runElevated('net.exe', ['stop', this._vars.label + '.exe'])
      .return(true)
      .catch(error => {
        if (error.code === 2) {
          // service was not running
          return false;
        }
        return Promise.reject(error);
      });
  }

  /**
   * @returns {Promise<boolean>}
   */
  isAdmin() {
    return Promise.resolve(true);
  }

  /**
   * Elevate is similar to `sudo` on Linux/Mac. It attempts to elevate the privileges of the
   * current user to a local administrator. Using this does not require a password, but it
   * does require that the current user have administrative privileges. Without these
   * privileges, the command will fail with a `access denied` error.
   *
   * On systems with UAC enabled, this may prompt the user for permission to proceed:
   *
   * ![UAC Prompt](http://upload.wikimedia.org/wikipedia/en/5/51/Windows_7_UAC.png)
   *
   * @param {String} cmd The command to execute with elevated privileges.
   * @param {String[]} args The command arguments
   * @returns {Promise}
   */
  static runElevated(cmd, args) {
    args.unshift(cmd);

    // workaround to prevent spaces in command, see https://github.com/nodejs/node/issues/7367
    const relativeElevatePath = path.relative(process.cwd(), ELEVATE_PATH);

    return Utils.run(relativeElevatePath, args);
  }

  /**
   * Creates a "daemon" folder in the pattypm home directory and copies winws.exe in that folder,
   * renaming it to the name of the created service.
   *
   * @returns {Promise}
   * @private
   */
  _createDaemon() {
    const exeConfigTarget = path.resolve(this._daemonPath, this._vars.label + '.exe.config');
    const scriptTarget = path.resolve(this._daemonPath, this._vars.label + '.xml');

    return Utils.ensureDir(this._daemonPath).then(() => {
      return Utils.copy(WINSW_PATH, this._exeTarget);
    }).then(() => {
      return Utils.copy(WINSW_CONFIG_PATH, exeConfigTarget);
    }).then(() => {
      return Utils.readFile(SCRIPT_TEMPLATE_PATH);
    }).then(template => {
      return Utils.renderMoustache(template, this._vars);
    }).then(templateBody => {
      return Utils.writeFile(scriptTarget, templateBody.replace(/[\r\n]+/g, '\r\n'));
    });
  }

  /**
   * @returns {Promise}
   * @private
   */
  _deleteDaemon() {
    fs.removeSync(this._daemonPath);
    return Promise.resolve();
  }

  /**
   * @returns {Promise}
   * @private
   */
  _install() {
    return WindowsSystem.runElevated(this._exeTarget, ['install']).delay(2000);
  }

  /**
   * @returns {Promise}
   * @private
   */
  _uninstall() {
    return WindowsSystem.runElevated(this._exeTarget, ['uninstall']).delay(1000);
  }

}

module.exports = WindowsSystem;

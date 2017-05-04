/**
 * LINKURIOUS CONFIDENTIAL
 * Copyright Linkurious SAS 2012 - 2017
 *
 * - Created by david on 2017-02-10.
 */
'use strict';

/**
 * @typedef {object} ServiceOptions
 * @property {string} name
 * @property {string} binPath (if relative, resolve from `serviceOptions.home`)
 * @property {Array<string>} arguments
 * @property {string|undefined} home (fi relative, resolve from `pattyHome.dir`)
 * @property {object|undefined} env Environment variables
 * @property {boolean|undefined} disabled Whether the service is disabled (will not start)
 * @property {number|undefined} maxRestarts undefined/null:no-restarts, 0:unlimited-restarts, n:max-allow-restarts
 * @property {number|undefined} restartDelay Delay before a auto-restart (default to DEFAULT_RESTART_DELAY)
 * @property {number[]|undefined} noRestartExitCodes List of exit codes that will prevent auto-restart (when auto-restart is enabled)
 */

/**
 * @typedef {object} ServiceState
 * @property {boolean} started
 * @property {number|undefined} startTime
 * @property {number|undefined} stopTime
 * @property {number|undefined} pid
 * @property {number|undefined} exitCode
 * @property {string|undefined} exitSignal
 * @property {boolean|undefined} disabled
 * @property {number} restarts
 */

// builtin
const path = require('path');
//const fs = require('fs');

// dependencies
const Promise = require('bluebird');

// local
const PattyError = require('./PattyError');
const Utils = require('./Utils');

const WAIT_AFTER_START = 1.5 * 1000;
const DEFAULT_RESTART_DELAY = 5 * 1000;

class PattyService {

  /**
   * @param {PattyHome} pattyHome
   * @param {ServiceOptions} options
   * @param {ServiceLogger} logger
   */
  constructor(pattyHome, options, logger) {
    // safe defaults values
    if (!options.arguments) { options.arguments = []; }
    if (!options.env) { options.env = {}; }

    /** @type {Promise|null} */
    this._startingPromise = null;

    /** @type {boolean} */
    this._wantStop = false;

    /** @type {ServiceOptions} */
    this._options = options;

    /** @type {PattyHome} */
    this._home = pattyHome;

    /** @type {ServiceLogger} */
    this._logger = logger;

    //logger.warn(JSON.stringify(options));

    /** @type {ServiceState} */
    this.state = {
      started: false,
      pid: undefined,
      startTime: undefined,
      stopTime: undefined,
      exitCode: undefined,
      exitSignal: undefined,
      restarts: 0,
      disabled: options.disabled
    };

    /** @type {ChildProcess} */
    this._child = null;
  }

  /**
   * @returns {ServiceOptions}
   */
  get options() {
    return this._options;
  }

  /**
   * @param {ServiceOptions} options
   */
  set options(options) {
    Utils.check.properties('options', options, Utils.SERVICE_OPTIONS_PROPERTIES(this._home));
    this._options = options;
    this._log('updating options ' + JSON.stringify(options));

    if (this.state.started && options.disabled) {
      this._log('service is now disabled, stopping ...');
      this.stop();
    }
  }

  /**
   * @returns {string}
   */
  get absHome() {
    return this.options.home
      ? path.resolve(this._home.dir, this.options.home)
      : this._home.dir;
  }

  /**
   * @returns {string}
   */
  getAbsBinPath() {
    return path.resolve(this.absHome, this.options.binPath);
  }

  /**
   * @returns {Promise<number|null>} PID (null if the service is disabled)
   */
  start() {
    this._wantStop = false;

    if (this.state.started) {
      // if already started, return null
      return Promise.resolve(null);
    }

    this.state.restarts = 0;
    return this._start(0).delay(WAIT_AFTER_START);
  }

  /**
   * @param {number} delay
   * @returns {Promise.<number|null>} PID or null (is disabled)
   * @private
   */
  _start(delay) {
    const absBinPath = this.getAbsBinPath();
    Utils.check.file('binPath', absBinPath);

    // if already starting, return the promise
    if (this._startingPromise) {
      this._log('start called while already starting, being smart');
      return this._startingPromise;
    }

    return this._startingPromise = Promise.delay(delay).then(() => {
      return this._spawn(absBinPath);
    }).catch(e => {
      this._startingPromise = null;
      return Promise.reject(e);
    }).finally(() => {
      this._startingPromise = null;
    });
  }

  /**
   * @param {string} absBinPath
   * @returns {Promise<number|null>}
   * @private
   */
  _spawn(absBinPath) {
    return new Promise((resolve, reject) => {

      // the service is disabled
      if (this.state.disabled) {
        return resolve(null);
      }

      // 'stop' or 'kill' was called and 'start' was not called again => auto-restarts gets ignored
      if (this._wantStop) {
        return resolve(null);
      }

      this._log('SPAWN: ' + JSON.stringify(this.options, ' ', null));
      this._log('SPAWN bin path: ' + JSON.stringify(absBinPath, ' ', null));

      this._child = Utils.spawn(
        absBinPath,
        this.options.arguments,
        {
          cwd: this.absHome,
          env: this.options.env,
          //argv0: this.options.name,
          stdio: ['ignore', 'pipe', 'pipe'], // stdin, stdout, stderr
          detached: false,
          // uid: undefined,
          // gid: undefined,
          shell: false
        }
      );

      Utils.captureLines(this._child.stdout, line => {
        this._logger.debug(line.toString());
      });

      Utils.captureLines(this._child.stderr, line => {
        this._logger.warn(line.toString());
      });

      this._child.on('exit', (code, signal) => {
        this._onStop(code, signal);
      });

      this._child.on('error', error => {
        if (!this.state.started) {
          // caused by a failure to spawn
          reject(PattyError.other(`Could not start service "${this.options.name}"`, error));
        } else {
          this._logErr(PattyError.other('Could not send signal', error).fullStack);
        }
      });

      this.state.pid = this._child.pid;
      this._onStart();
      resolve(this._child.pid);
    });
  }

  /**
   * @param {string} line
   * @private
   */
  _log(line) {
    this._logger.info(line);
  }

  /**
   * @param {string} line
   * @private
   */
  _logErr(line) {
    this._logger.error(line);
  }

  /**
   * @param {number} exitCode
   * @param {string} signal
   * @private
   */
  _onStop(exitCode, signal) {
    this.state.started = false;
    this.state.exitCode = exitCode;
    this.state.existSignal = signal;
    this.state.stopTime = Date.now();
    this._log('stopped ' + JSON.stringify({code: exitCode, exitSignal: signal}));

    this._handleAutoRestart(exitCode);
  }

  /**
   * @param {number} exitCode
   * @private
   */
  _handleAutoRestart(exitCode) {
    if (this._wantStop) {
      return;
    }

    const max = this.options.maxRestarts;

    if (typeof max !== 'number') {
      // auto-restart not enabled
      return;
    }

    if (max !== 0 && this.state.restarts >= max) {
      this._logger.info(`reached maximum number of restarts (${max}), will no restart`);
      return;
    }

    if (this.options.noRestartExitCodes && this.options.noRestartExitCodes.includes(exitCode)) {
      this._logger.info(`auto-restart is disabled for exit code ${exitCode}`);
      return;
    }

    this.state.restarts++;
    const delay = this.options.restartDelay || DEFAULT_RESTART_DELAY;
    this._log(`auto-restarting (${
      this.state.restarts}/${max === 0 ? 'unlimited' : max}) in ${delay}ms ...`
    );
    this._start(delay).catch(e => {
      this._logErr(PattyError.other('Restart failed', e).fullStack);
    });
  }

  /**
   * @private
   */
  _onStart() {
    this.state.started = true;
    this.state.startTime = Date.now();
    this._log('started');
  }

  /**
   * Preventing further auto-restart and sending term/kill signal if the service is started.
   *
   * @param {string} signal
   * @returns {Promise}
   */
  _stop(signal) {
    this._wantStop = true;

    if (!this._child || this._child.pid === undefined || !this.state.started) {
      this._log(`stop (${signal}): service not started, preventing auto-restart`);
      return Promise.resolve();
    }

    this._log(`stop (${signal}): sending signal`);
    return Utils.treeKill(this._child.pid, signal);
  }

  /**
   * Send a SIGTERM to the process
   * Resolves when the process terminates, rejects if the process is still running after 2 seconds.
   *
   * @returns {Promise}
   */
  stop() {
    return this._stop('SIGTERM').then(() => {
      // resolve when stopped, or reject after 2 seconds if nothing happens
      return Utils.resolveWhenTrue(() => !this.state.started, 100, 2000);
    });
  }

  /**
   * Send a SIGKILL to the process
   * Resolves when the process terminates, rejects if the process is still running after 2 seconds.
   *
   * @returns {Promise}
   */
  kill() {
    return this._stop('SIGKILL').then(() => {
      // resolve when stopped, or reject after 2 seconds if nothing happens
      return Utils.resolveWhenTrue(() => !this.state.started, 100, 2000);
    });
  }
}

module.exports = PattyService;

/**
 * LINKURIOUS
 * Copyright Linkurious SAS 2012 - 2017
 *
 * - Created by david on 2017-02-09.
 */
'use strict';

const http = require('http');
const path = require('path');
const Promise = require('bluebird');

const Utils = require('./Utils');
const Patty = require('./Patty');
const PattyError = require('./PattyError');
const PattyController = require('./PattyController');
const ServerLogger = require('./log/ServerLogger');

class PattyServer {

  /**
   * @param {PattyHome} home
   * @param {PattyOptions} options
   */
  constructor(home, options) {
    /** @type {PattyHome} */
    this.home = home;

    /** @type {PattyOptions} */
    this.options = options;

    ///** @type {net.Server} */
    /** @type {http.Server} */
    this.server = undefined;

    /** @type {ServerLogger} */
    this._logger = new ServerLogger(home, options);

    /** @type {PattyController} */
    this.controller = new PattyController(home, options, this._logger);

    process.title = this.options.name + ' PPM';
  }

  /**
   * @returns {Promise<PattyServer>}
   */
  init() {
    return this._logger.init().return(this);
  }

  /**
   * @returns {Promise<PattyServer>}
   */
  static load() {
    return Utils.resolveHome().then(home => {
      return Utils
        .loadOptions(home)
        .then(options => new PattyServer(home, options))
        .then(pattyServer => pattyServer.init());
    });
  }

  /**
   * @param {PattyHome} home
   * @param {object} [env={}]
   * @returns {object} patched env
   */
  static makeHomeEnv(home, env) {
    if (!env) { env = {}; }
    env[Utils.CONFIG_PATH_ENV_KEY] = Utils.getConfigPath(home);
    return env;
  }

  /**
   * @private
   */
  _setProcessOwner() {
    // nothing to do for non-posix system
    if (!process.setuid) { return; }

    // no target user to switch to
    if (!this.options.processOwner) { return; }

    try {
      process.setuid(this.options.processOwner);
    } catch(e) {
      // throw PattyError.other()
      this.logError(`Could not change process owner to "${this.options.processOwner}"`, e);
    }
  }

  /**
   * @param {string} message
   * @param {Error} error
   */
  logError(message, error) {
    this._logger.error(message, error);
  }

  /**
   * @param {string} message
   */
  log(message) {
    this._logger.info(message);
  }

  /**
   * @returns {Promise}
   */
  start() {
    this.log('starting...');

    return Promise.resolve().then(() => {
      this._setProcessOwner();

      return this._startWebServer();
    }).then(server => {
      this.server = server;

      return this.controller.$start();
    }).then(() => {
      const o = Utils.clone(this.options);
      delete o.services;
      delete o.version;
      this.log('started ' + JSON.stringify(o));
    }).then(() => {
      if (this.options.autoStartServices) {
        return this.controller.startServices({});
      }
    }).catch(e => {
      this._logger.error('Could not start', e);
      return Promise.reject(e);
    });
  }

  /**
   * @returns {Promise<http.Server>}
   * @private
   */
  _startWebServer() {
    const server = http.createServer((req, res) => {
      let pretty = false;
      this._parseRequest(req).then(requestBody => {

        if (req.url.indexOf(';pretty=true') >= 0) {
          pretty = true;
        }
        return this.respond({
          method: req.method,
          url: req.url,
          body: requestBody
        });
      }).then(responseBody => {
        res.statusCode = 200;
        res.setHeader('Content-type', 'application/json');
        res.end(JSON.stringify(responseBody, null, pretty ? '  ' : ''));
        // res.end is async but we don't need to wait until the response is sent
      }).catch(err => {
        const pe = PattyError.fix(err);

        //console.log('>>>'+JSON.stringify(pe.type, null, ' '))
        if (pe.type !== 'business' && pe.type !== 'protocol') {
          this.logError('could not process request', pe);
        }

        res.statusCode = 500;
        res.setHeader('Content-type', 'application/json');
        res.end(JSON.stringify({
          error: pe.fullMessage,
          version: this.options.version
        }));
      });
    });

    return new Promise((resolve, reject) => {
      let promiseClosed = false;

      /**
       * @param {*|null} err
       */
      const close = (err) => {
        if (promiseClosed) {
          return;
        }
        promiseClosed = true;
        if (err) {
          if (err.code === 'EADDRINUSE') {
            return reject(PattyError.other(
              `Could not start HTTP server: port ${this.options.port} is already in use.`
            ));
          }

          reject(PattyError.other('Could not start HTTP server', err));
        } else {
          this.log('socket ready');
          resolve(server);
        }
      };

      server.on('error', err => {
        close(err);
      });

      //this.server = server;
      server.listen(this.options.port, '127.0.0.1', (err) => {
        if (err) {
          close(err);
        } else {
          close(null);
        }
      });
    });
  }

  /**
   * @param {http.IncomingMessage|Readable} req
   * @return {Promise<*>} promise of the parsed request body
   */
  _parseRequest(req) {
    let body = '';
    let promiseClosed = false;

    return new Promise((resolve, reject) => {

      /**
       * @param {*|null} err
       * @param {*} [value]
       */
      const close = (err, value) => {
        if (promiseClosed) {
          return;
        }
        promiseClosed = true;
        if (err) {
          reject(err);
        } else {
          resolve(value);
        }
      };

      req.on('data', chunk => {
        body += chunk;
      });

      req.on('error', err => {
        close(PattyError.communication('Could not receive request', err));
      });

      req.on('end', () => {
        try {
          close(null, body === '' ? null : JSON.parse(body));
        } catch(error) {
          close(PattyError.protocol('JSON is invalid', error));
        }
      });
    }).catch(err => {
      return PattyError.communicationP('Could not parse request', err);
    });
  }

  /**
   * @param {object} request
   * @param {string} request.url
   * @param {string} request.method
   * @param {object} request.body
   * @param {string} request.body.version
   * @param {string} request.body.secret
   * @param {string} request.body.action
   * @param {object} request.body.options
   * @returns {Promise<object>|object} response;
   */
  respond(request) {
    if (!request.body) {
      throw PattyError.protocol('Request body is missing');
    }

    const action = request.body.action;
    if (typeof action !== 'string' || action.length < 2 || action[0] === '_' || action[0] === '$') {
      throw PattyError.protocol(`Invalid action (${action})`);
    }

    const version = request.body.version;
    if (version !== this.options.version) {
      throw PattyError.protocol(
        `Version mismatch (expected ${this.options.version}, got ${version})`
      );
    }

    if (request.body.secret !== this.options.secret) {
      throw PattyError.protocol('Wrong secret');
    }
    // not needed anymore after this step, will prevent the secret from being logged.
    delete request.body.secret;

    if (typeof this.controller[action] !== 'function') {
      throw PattyError.protocol(`Action "${action}" does not exist`);
    }

    return Promise.resolve().then(() => {
      if (action !== 'ping') {
        this._logger.info(`action: "${action}" option:${JSON.stringify(request.body.options)}`);
      }
      return this.controller[action].call(this.controller, request.body.options);
    }).then(content => ({
      content: content,
      version: this.options.version
    }));
  }

  /**
   * @param {PattyHome} home
   * @param {number} [timeout=500]
   * @returns {Promise}
   */
  static spawn(home, timeout) {
    if (!timeout) { timeout = 500; }

    /** @type {ChildProcess} */
    const childProcess = Utils.spawn(
      process.argv[0],
      [path.resolve(__dirname, '..', 'bin', 'server.js')],
      {
        cwd: process.cwd(),
        // argv0: undefined, // process name, set later using process.title
        env: PattyServer.makeHomeEnv(home),
        stdio: 'ignore',
        detached: true,
        // uid: undefined, // process owner, set later using process.setuid()
        // gid: undefined,
        shell: false
      },
      true
    );

    return new Promise((resolve, reject) => {
      let doneCalled = false;

      /**
       * @param {PattyError} err
       */
      const done = (err) => {
        //console.log('spawn done - err:' + err);

        // guard against multiple calls
        if (doneCalled) { return; }
        doneCalled = true;

        //noinspection JSUnresolvedFunction
        childProcess.unref();

        if (err) {
          reject(err);
        } else {
          resolve();
        }
      };

      childProcess.once('close', (code, signal) => {
        if (code !== undefined && code !== null) {
          done(PattyError.other(`Manager could not start (code ${code})`))
        } else if (signal !== undefined && signal !== null) {
          done(PattyError.other(`Manager could not start (signal ${signal})`))
        } else {
          done(PattyError.other('Manager could not start'))
        }
      });

      childProcess.once('error', error => {
        done(PattyError.other('Failed to start manager', error));
      });

      setTimeout(done, timeout)
    });
  }
}

module.exports = PattyServer;

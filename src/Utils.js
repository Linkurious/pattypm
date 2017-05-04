/**
 * LINKURIOUS
 * Copyright Linkurious SAS 2012 - 2017
 *
 * - Created by david on 2017-02-10.
 */
'use strict';

// builtin
const path = require('path');

// dependencies
const Promise = require('bluebird');
const fs = require('fs-extra');
const Child = require('child_process');
const Valcheck = require('valcheck');
const treeKill = require('tree-kill');
const humanize = require('humanize');

// local
const PattyError = require('./PattyError');

const UNLINK_P = Promise.promisify(fs.unlink);
const COPY_P = Promise.promisify(fs.copy);
const ENSURE_DIR_P = Promise.promisify(fs.ensureDir);
const DEFAULT_LINE_BUFFER_SIZE = 1024 * 1024;
const RUN_VBS = path.resolve(__dirname, 'run.vbs');
const DEFAULT_CONFIG_FILE = 'pattypm.json';
const PROTOCOL_VERSION = '0.1';
const MUSTACHE_REFERENCE_RE = /\{\{([^}]+?)}}/g;
const MUSTACHE_REFERENCE_VALID = /^[a-z_]+$/;

/** @type {Valcheck} */
const CHECK = new Valcheck(errorMessage => {
  throw PattyError.protocol(errorMessage);
});

/**
 * @typedef {object} PattyOptions
 * @property {string} name
 * @property {string} description
 * @property {number} port
 * @property {ServiceOptions[]} services
 * @property {string} secret
 * @property {number|undefined} maxLogSize (default: 5MB)
 * @property {number|undefined} maxLogFiles (default: 10)
 * @property {boolean|undefined} autoStartServices (default: false)
 * @property {string|undefined} processOwner
 * @property {string} [version] (automatically populated in checkOptions)
 */

/**
 * @typedef {object} PattyHome
 * @property {string} dir
 * @property {string|undefined} [configFile]
 */

class Utils {

  /**
   * @returns {humanize}
   */
  static get humanize() {
    return humanize;
  }

  /**
   * @returns {Valcheck}
   */
  static get check() {
    return CHECK;
  }

  /**
   * @param {string} dirPath
   * @returns {Promise}
   */
  static ensureDir(dirPath) {
    return ENSURE_DIR_P(dirPath);
  }

  /**
   * @param {string} source
   * @param {string} target
   * @returns {Promise}
   */
  static copy(source, target) {
    return COPY_P(source, target);
  }

  /**
   * @param {string} filePath
   * @returns {Promise}
   */
  static unlink(filePath) {
    return UNLINK_P(filePath);
  }

  /**
   * @param {string} filePath
   * @returns {Promise<boolean>}
   */
  static canReadFile(filePath) {
    return new Promise((resolve, reject) => {
      fs.access(filePath, fs.constants.R_OK, (err) => {
        //console.log('access?' + filePath + '__'+JSON.stringify(err, null, ' '))
        if (err && err.code === 'ENOENT') {
          return resolve(false);
        } else if (err) {
          return reject(PattyError.other(`Could not read file "${path.basename(filePath)}"`, err));
        } else {
          return resolve(true);
        }
      });
    });
  }

  /**
   * @param {string} template
   * @param {object} vars
   */
  static renderMoustache(template, vars) {
    const references = new Set();

    // extract references
    const referenceRe = new RegExp(MUSTACHE_REFERENCE_RE.source, 'g');
    let match;
    while ((match = referenceRe.exec(template)) !== null) {
      let ref = match[1];
      if (!ref.match(MUSTACHE_REFERENCE_VALID)) {
        throw new ReferenceError(
          `Invalid reference format: "${ref}", must match ${MUSTACHE_REFERENCE_VALID}.`
        );
      }
      references.add(ref);
    }

    let result = template;

    // replace references
    for (let ref of references) {
      if (!vars.hasOwnProperty(ref)) {
        throw new ReferenceError(`Unknown reference: "${ref}".`);
      }
      result = result.replace(new RegExp('\\{\\{' + ref + '}}', 'g'), vars[ref]);
    }

    return result;
  }

  /**
   * @param {string} filePath
   * @returns {Promise}
   */
  static ensureFile(filePath) {
    return new Promise((resolve, reject) => {
      fs.ensureFile(filePath, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * @param {string} filePath
   * @param {string} data
   * @param {number|string} [mode=0o600]
   * @returns {Promise}
   */
  static writeFile(filePath, data, mode) {
    if (mode === undefined) { mode = 0o600; }

    return Utils.ensureDir(path.dirname(filePath)).then(() => new Promise((resolve, reject) => {
      fs.writeFile(filePath, data, {
        encoding: 'utf8',
        mode: mode,
        flag: 'w'
      }, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    }));
  }

  /**
   * @param {string} filePath
   * @returns {Promise<string>}
   */
  static readFile(filePath) {
    return new Promise((resolve, reject) => {
      fs.readFile(filePath, {
        encoding: 'utf8',
        flag: 'r'
      }, (err, data) => {
        if (err) {
          reject(err);
        } else {
          resolve(data);
        }
      });
    });
  }

  /**
   * @param {Readable} stream
   * @param {function(Buffer)} cb
   * @param {number} [bufferSize=1MB] (defaults to 1MB)
   */
  static captureLines(stream, cb, bufferSize) {
    if (!bufferSize) { bufferSize = DEFAULT_LINE_BUFFER_SIZE; }

    // reset stream encoding to get "Buffer" objects
    //stream.setEncoding(null);

    let buffer = null, line, lineStart = 0, lineEnd;
    stream.on('data', chunk => {
      if (buffer === null) {
        buffer = chunk;
      } else {
        buffer = Buffer.concat([buffer, chunk]);
      }

      while ((lineEnd = buffer.indexOf(0x0a, lineStart)) > lineStart) {
        if (buffer[lineEnd - 1] === 0x0d) {
          // ignore "\r" if placed just before "\n"
          line = buffer.slice(lineStart, lineEnd - 1);
        } else {
          line = buffer.slice(lineStart, lineEnd - 0);
        }
        cb(line);
        lineStart = lineEnd + 1;
      }

      // when the buffer becomes too long, remove already emitted lines at beginning of the buffer
      if (lineStart > bufferSize) {
        let newBuffer = Buffer.allocUnsafe(buffer.length - lineStart);
        buffer.copy(newBuffer, 0, lineStart);
        buffer = newBuffer;
        lineStart = 0;
      }
    });
    stream.on('end', () => {
      if (buffer !== null && buffer.length > lineStart) {
        //console.log('-->'+buffer.length + ' -- ' + lineStart)
        cb(buffer.slice(lineStart));
      }
    });
  }

  /**
   * @param {string} binPath
   * @param {string[]} args
   * @param {object} options
   * @param {boolean} [hideWindowsConsole=false] Use a wrapper to hide the terminal console on Win32
   * @returns {ChildProcess}
   */
  static spawn(binPath, args, options, hideWindowsConsole) {
    if (process.platform === 'win32' && hideWindowsConsole) {
      /*
       * alternative method: generate a patched version of node
       * - https://github.com/nodejs/node/issues/556#issuecomment-271066690
       * - https://github.com/ukoloff/nvms/blob/master/src/tools/nodew.coffee
       */

      args = [RUN_VBS, binPath].concat(args);

      // "wscript.exe": window application
      // "cscript.exe": console application
      binPath = 'wscript.exe';
    }
    //console.log(binPath + ' --> ' + JSON.stringify(args))
    return Child.spawn(binPath, args, options);
  }

  /**
   * @param {string} command
   * @param {object} [options]
   * @returns {Promise<{err: string, out: string}>}
   */
  static exec(command, options) {
    return new Promise((resolve, reject) => {
      Child.exec(command, options, (error, stdout, stderr) => {
        if (error) {
          // we use a business error because to avoid displaying a useless stack trace
          let e = PattyError.business(error.message);
          e.code = error.code;
          e.killed = error.killed;
          return reject(e);
        }
        resolve({out: stdout, err: stderr});
      });
    });
  }

  /**
   *
   * @param {string} command
   * @param {string[]} args
   * @returns {Promise<{out: string, err: string}|PattyError>}
   */
  static run(command, args) {
    return new Promise((resolve, reject) => {
      const child = Child.spawn(command, args, {shell: false});

      const std = {out: '', err: ''};
      child.stdout.on('data', chunk => std.out += chunk);
      child.stderr.on('data', chunk => std.err += chunk);

      child.on('close', code => {
        if (code === 0) {
          resolve(std);
        } else {
          const error = PattyError.other(std.err + ' ' + std.out);
          error.code = code;
          reject(error);
        }
      });
    });
  }

  /**
   * @param {object} o
   * @returns {object}
   */
  static clone(o) {
    return JSON.parse(JSON.stringify(o));
  }

  /**
   *
   * @param {function():boolean} checkIfOk
   * @param [interval=100]
   * @param [timeout=500]
   * @return Promise
   */
  static resolveWhenTrue(checkIfOk, interval, timeout) {
    if (interval === undefined) { interval = 100; }
    if (timeout === undefined) { timeout = 500; }
    const startTime = Date.now();

    const check = (resolve, reject) => {
      const ok = checkIfOk();
      if (ok) {
        return resolve();
      }

      const totalDuration = Date.now() - startTime;
      if (totalDuration > timeout) {
        return reject(PattyError.other(`Did not resolve after ${timeout} ms`));
      }

      setTimeout(() => check(resolve, reject), interval);
    };

    return new Promise((resolve, reject) => {
      check(resolve, reject);
    });
  }

  /**
   * @param {number} pid
   * @param {string} signal
   */
  static treeKill(pid, signal) {
    return new Promise((resolve, reject) => {
      treeKill(pid, signal, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  // PattyPM-specific code

  /**
   * @returns {string}
   */
  static get CONFIG_PATH_ENV_KEY() {
    return 'PPM_CONFIG_PATH';
  }

  /**
   * @returns {Promise<PattyHome>}
   */
  static resolveHome() {
    return Promise.resolve().then(() => {

      if (process.env[Utils.CONFIG_PATH_ENV_KEY]) {
        return {source: 'env', path: process.env[Utils.CONFIG_PATH_ENV_KEY]};
      }

      return {source: 'cwd', path: path.resolve(DEFAULT_CONFIG_FILE)};

    }).then(configInfo => {
      return Utils.canReadFile(configInfo.path).then(canRead => {
        if (canRead) { return configInfo.path; }

        if (configInfo.source === 'cwd') {
          return PattyError.otherP(
            `Could not resolve PattyPM home: "${Utils.CONFIG_PATH_ENV_KEY}" is not set and "${
              DEFAULT_CONFIG_FILE}" was not found in current working directory.`
          );
        }

        if (configInfo.source === 'env') {
          return PattyError.otherP(
            `Could not resolve PattyPM home: "${Utils.CONFIG_PATH_ENV_KEY}" is set to "${
              configInfo.path}", which can't be read.`);
        }

      });
    }).then(configPath => {

      /** @type {PattyHome} */
      return {
        dir: path.resolve(path.dirname(configPath)),
        configFile: path.basename(configPath)
      };
    });
  }

  /**
   * @param {PattyHome} home
   * @returns {string} configPath (absolute path to PattyPM configuration file)
   */
  static getConfigPath(home) {
    Utils.check.properties('home', home, {
      dir: {required: true, check: 'dir'},
      configFile: {required: false, check: 'nonEmpty'}
    });

    if (!home.configFile) {
      home.configFile = DEFAULT_CONFIG_FILE;
    }

    const configPath = path.resolve(home.dir, home.configFile);
    Utils.check.file('configPath', configPath);

    return configPath;
  }

  /**
   * @param {string} configPath
   * @returns {PattyHome}
   */
  static parseConfigPath(configPath) {
    return {
      dir: path.resolve(path.dirname(configPath)),
      configFile: path.basename(configPath)
    };
  }

  /**
   * @param {PattyHome} home
   * @returns {Promise<PattyOptions>}
   */
  static loadOptions(home) {
    try {
      const configPath = Utils.getConfigPath(home);
      return Utils.canReadFile(configPath).then(exists => {
        if (exists) {
          return Utils.readFile(configPath).then(data => JSON.parse(data)).catch(e => {
            return PattyError.businessP(`Could not load configuration file (${e.message})`);
          });
        } else {
          return PattyError.otherP('Configuration file not found');
        }
      }).then(options => {
        Utils.checkOptions(home, options);
        return options;
      });
    } catch(e) {
      return PattyError.otherP('Invalid home configuration', e);
    }
  }

  static SERVICE_OPTIONS_PROPERTIES(home) {
    return {
      // required
      name: {required: true, check: 'nonEmpty'},
      binPath: {required: true, check: 'nonEmpty'},
      // optional
      disabled: {required: false, type: 'boolean'},
      // maxRestarts null/undefined:no-restart 0:unlimited n:max-restarts
      maxRestarts: {required: false, check: 'posInt'},
      restartDelay: {required: false, check: ['integer', 100, 60 * 1000]},
      noRestartExitCodes: {required: false, check: 'intArray'},
      arguments: {required: false, arrayItem: {type: ['string', 'number']}},
      env: {required: false, anyProperty: {type: ['string', 'number']}},
      home: {required: false, check: ['dir', home.dir]}
    };
  }

  /**
   * @param {PattyHome} home
   * @param {PattyOptions} options
   * @throws {PattyError} if options is invalid
   */
  static checkOptions(home, options) {
    options.version = PROTOCOL_VERSION;

    Utils.check.properties('options', options, {
      name: {required: true, check: 'nonEmpty'},
      description: {required: true, check: 'nonEmpty'},
      port: {required: true, check: 'port'},
      maxLogSize: {required: false, check: ['integer', 500 * 1024]},
      maxLogFiles: {required: false, check: ['integer', 2]},
      secret: {required: true, check: 'nonEmpty'},
      processOwner: {required: false, check: 'nonEmpty'},
      autoStartServices: {required: false, type: 'boolean'},
      services: {required: false, arrayItem: {properties: Utils.SERVICE_OPTIONS_PROPERTIES(home)}},
      // automatically populated
      version: {required: true, check: 'nonEmpty'}
    });

    // default values
    if (!options.services) { options.services = []; }
    if (options.autoStartServices === undefined) { options.autoStartServices = true; }
  }
}

module.exports = Utils;

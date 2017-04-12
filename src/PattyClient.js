/**
 * LINKURIOUS
 * Copyright Linkurious SAS 2012 - 2017
 *
 * - Created by david on 2017-02-09.
 */
'use strict';

const http = require('http');
const Promise = require('bluebird');

const PattyError = require('./PattyError');

/**
 * @typedef {object} QueryOptions
 * @property {number} [timeout=1000] In milliseconds.
 * @property {number} [retries=0] Number of retries (0 retries = 1 try)
 * @property {number} [retryDelay=500] Delay between retries
 */

class PattyClient {

  /**
   * @param {PattyOptions} options
   * @param {ClientLogger} logger
   */
  constructor(options, logger) {
    this.options = options;
    this._logger = logger;
  }

  /**
   * @param {QueryOptions} [queryOptions]
   * @param {boolean} [queryOptions.noReject=false] Whether to resolve with `false` if the server is offline
   * @returns {Promise.<boolean|PattyError>}
   */
  pingServer(queryOptions) {
    if (!queryOptions) { queryOptions = {}; }
    return this._query('ping', {}, queryOptions).then(() => true).catch(e => {
      /** @type {PattyError} */
      const pe = PattyError.fix(e);

      // if the server is offline AND noReject is enabled
      if (queryOptions.noReject && (pe.matches('ECONNREFUSED') || pe.matches('TIMEOUT'))) {
        return false;
      }

      return Promise.reject(pe);
    });
  }

  /**
   * @return {Promise<PattyOptions>}
   */
  getOptions() {
    return this._query('getOptions', {});
  }

  /**
   * @returns {Promise}
   */
  killServer() {
    return this._query('kill', {}, {}).delay(500);
  }

  /**
   * @param {ServiceOptions} options
   * @returns {Promise}
   */
  addService(options) {
    return this._query('addService', options);
  }

  /**
   * @returns {Promise<{name: string, state: ServiceState}>}
   */
  getServicesState() {
    return this._query('getServicesState', {});
  }

  /**
   * @returns {Promise<number[]>}
   */
  startServices() {
    return this._query('startServices', {}, {timeout: this.options.services.length * 3000});
  }

  /**
   * @returns {Promise}
   */
  stopServices() {
    return this._query('stopServices', {}, {timeout: this.options.services.length * 3000});
  }

  /**
   * @returns {Promise.<string[]>}
   */
  getServices() {
    return this._query('getServices', {});
  }

  /**
   * @param {string} name
   * @returns {Promise.<{options: ServiceOptions, state: ServiceState}>}
   */
  getService(name) {
    return this._query('getService', {name: name});
  }

  /**
   * @param {string} name
   * @returns {Promise}
   */
  startService(name) {
    return this._query('startService', {name: name}, {timeout: 3000});
  }

  /**
   * @param {string} name
   * @returns {Promise}
   */
  stopService(name) {
    return this._query('stopService', {name: name}, {timeout: 3000});
  }

  /**
   * @param {string} name
   * @param {ServiceOptions} options
   * @returns {Promise}
   */
  updateService(name, options) {
    if (!options) { options = {}; }
    options.name = name;
    return this._query('updateService', options);
  }

  /**
   * @param {string} action
   * @param {object} actionOptions
   * @param {QueryOptions} [queryOptions]
   * @returns {Promise.<*>}
   */
  _query(action, actionOptions, queryOptions) {
    if (!queryOptions) { queryOptions = {}; }
    if (!queryOptions.timeout) { queryOptions.timeout = 2000; }
    if (!queryOptions.retries) { queryOptions.retries = 0; }
    if (!queryOptions.retryDelay) { queryOptions.retryDelay = 300; }

    const query = {
      action: action,
      options: actionOptions,
      version: this.options.version,
      secret: this.options.secret
    };

    return this._retry(queryOptions.retries, queryOptions.retryDelay, () => {
      // adding a promise timeout because this is longer than supposed to on windows.

      return this
        ._httpPromise('POST', '/', query, queryOptions.timeout)
        .timeout(queryOptions.timeout, 'TIMEOUT');
    }).then(response => {

      //console.log('RESPONSE(' + action + '): ' + JSON.stringify(response));

      if (response.version !== query.version) {
        throw PattyError.protocol(
          `Wrong server version (${response.version}). Actual: ${query.version}.`
        );
      }

      return response.content;
    }).catch(e => {

      const pe = PattyError.fix(e);
      this._logger.warn(
        `query "${action}" (options: ${
        JSON.stringify(actionOptions)}) failed: ${pe.fullMessage}`
      );

      return Promise.reject(e);
    });
  }

  /**
   * @param {string} method
   * @param {string} url
   * @param {object} body
   * @param {number} timeout
   * @return {Promise<*>} promise of the response body (parsed as JSON)
   * @private
   */
  _httpPromise(method, url, body, timeout) {
    const stringBody = JSON.stringify(body);

    return new Promise((resolve, reject) => {

      /** @type {http.ClientRequest} */
      const req = http.request({
        hostname: '127.0.0.1',
        port: this.options.port,
        path: url,
        method: method,
        headers: {
          'User-Agent': 'PattyClient ' + this.options.version,
          'Content-Length': Buffer.byteLength(stringBody)
        },
        timeout: timeout
      }, res => {

        res.on('error', err => {
          reject(PattyError.communication('Could not respond', err));
        });

        let body = '';
        res.setEncoding('utf8');
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => {

          try {
            const parsedBody = JSON.parse(body);
            if (res.statusCode !== 200) {
              return reject(PattyError.protocol(
                `Unexpected HTTP status: ${res.statusCode}`,
                new Error(parsedBody.error)
              ));
            } else {
              return resolve(parsedBody);
            }

          } catch(err) {
            return reject(PattyError.protocol('Invalid JSON', err));
          }
        });

      });

      req.on('error', (err) => {
        reject(PattyError.communication('Could not send request', err));
      });

      // write data to request body
      req.write(stringBody);
      req.end();
    });
  }


  /**
   * @param {number} allowedRetries
   * @param {number} retryDelay
   * @param {function():Promise.<*>} promiseFunction
   * @param {number} [doneRetries=0]
   * @returns {Promise.<*>}
   * @private
   */
  _retry(allowedRetries, retryDelay, promiseFunction, doneRetries) {
    if (doneRetries === undefined) { doneRetries = 0; }
    return Promise.resolve().then(() => {
      return promiseFunction();
    }).catch(e => {
      if (doneRetries >= allowedRetries) {
        return Promise.reject(e);
      }
      return Promise.delay(retryDelay).then(() => {
        return this._retry(allowedRetries, retryDelay, promiseFunction, doneRetries + 1);
      });
    });
  }
}

module.exports = PattyClient;

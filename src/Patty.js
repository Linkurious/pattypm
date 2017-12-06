/**
 * LINKURIOUS
 * Copyright Linkurious SAS 2012 - 2017
 *
 * - Created by david on 2017-02-09.
 * http://dashflows.com/wp-content/uploads/2014/12/process_mgmt-dilbert.gif
 */
'use strict';

const Promise = require('bluebird');

const Utils = require('./Utils');
const PattyClient = require('./PattyClient');
const PattyServer = require('./PattyServer');
const PattyError = require('./PattyError');
const System = require('./system/System');
const Menu = require('./Menu');
const ServerLogger = require('./log/ServerLogger');
const ClientLogger = require('./log/ClientLogger');

class Patty {

  /**
   * @returns {Promise<Patty>}
   */
  static load() {
    return Utils.resolveHome().then(home => {
      return Utils
        .loadOptions(home)
        .then(options => new Patty(home, options))
        .then(p => p.init());
    });
  }

  /**
   * @returns {Promise<Patty>}
   */
  static loadConfig(configPath) {
    const home = Utils.parseConfigPath(configPath);
    return Utils
      .loadOptions(home)
      .then(options => new Patty(home, options))
      .then(p => p.init());
  }

  /**
   * @param {string} targetConfigPath
   * @param {PattyOptions} options
   * @returns {Promise<Patty>}
   */
  static createConfigFile(targetConfigPath, options) {
    const home = Utils.parseConfigPath(targetConfigPath);
    return Utils.ensureDir(home.dir).then(() => {
      Utils.checkOptions(home, options);
      return Utils.writeFile(targetConfigPath, JSON.stringify(options, null, '  '));
    });
  }

  /**
   * @param {PattyHome} home
   * @param {PattyOptions} options
   */
  constructor(home, options) {
    /** @type {PattyHome} */
    this.home = home;

    /** @type {PattyOptions} */
    this.options = options;

    this._logger = new ClientLogger(home, options);

    /** @type {PattyClient} */
    this.client = new PattyClient(options, this._logger);

    /** @type {System} */
    this.system = System.makePlatformSpecific(home, options, this._logger);

    /** @type {Menu} */
    this.menu = new Menu(home, options, this);

    /**
     * @type {Map<string, {date: Date, promise: Promise, value: *}>}
     * @private
     */
    this._cache = new Map();
  }

  /**
   * @returns {Promise}
   */
  init() {
    return this.system.init().then(() => {
      // check that the server-logger works
      const logger = new ServerLogger(this.home, this.options);
      return Promise.props({
        s: logger.init(),
        c: this._logger.init()
      }).return(this);
    });
  }

  /**
   * @param {function(MenuItem):boolean|null} [menuFilter=null]
   * @returns {Promise}
   */
  showMenu(menuFilter) {
    return this.menu.show(menuFilter);
  }

  /**
   * @returns {Promise<{
   *   installed: boolean,
   *   started: boolean,
   *   processOwner: string,
   *   services: Array<{name: string, state: ServiceState}>}
   * >}
   */
  getStatus() {
    return Promise.props({
      installed: this.system.isInstalled(),
      started: this.isServerStarted()
    }).then(result => {
      const whenOffline = (result) => {
        result.started = false;
        result.processOwner = this.options.processOwner;
        result.services = this.options.services.map(so => ({
          name: so.name,
          state: {
            started: false,
            disabled: so.disabled,
            restarts: 0
          }
        }));
        return result;
      };

      if (!result.started) {
        return whenOffline(result);
      }

      return this.client.getOptions().then(options => {
        result.processOwner = options.processOwner;
        return this.client.getServicesState();
      }).then(s => {
        result.services = s;
        return result;
      }).catch(e => {
        this._logger.error(`getStatus partially failed, assuming the manager went offline.`, e);
        return whenOffline(result);
      });
    });
  }

  /**
   * @param {string} processOwner
   * @returns {Promise} will reject if the manager is running with at least one started service.
   */
  setProcessOwner(processOwner) {
    if (this.options.processOwner === processOwner) {
      return Promise.resolve();
    }
    return this.getStatus().then(status => {
      if (!status.started) {
        this.options.processOwner = processOwner;
        return this.saveConfig();
      } else if (status.services.filter(si => si.state.started).length === 0) {
        return this.ensureStopped().then(() =>  {
          this.options.processOwner = processOwner;
          return this.saveConfig();
        }).then(() => {
          return this.ensureStarted();
        });
      } else {
        return PattyError.otherP(
          'Cannot set processOwner while manager is started, please stop manager first.'
        );
      }
    });
  }

  /**
   * @return {number}
   */
  get enabledServiceCount() {
    return this.options.services.filter(so => !so.disabled).length;
  }

  /**
   * @return {string}
   */
  get serviceSystem() {
    return this.system.getServiceSystem();
  }

  /**
   * @param {string} name
   * @return {Promise.<ServiceOptions|PattyError>}
   */
  getServiceOptions(name) {
    return this.isServerStarted().then(started => {
      if (started) {
        return this.client.getService(name).then(s => s.options);
      } else {
        return Utils.clone(this.options.services.find(so => so.name === name));
      }
    });
  }

  /**
   * @param {string} name
   * @param {ServiceOptions} options
   * @returns {Promise}
   */
  setServiceOptions(name, options) {
    options.name = name;
    Utils.check.properties('options', options, Utils.SERVICE_OPTIONS_PROPERTIES(this.home));

    return this.isServerStarted().then(started => {
      if (started) {
        return this.client.updateService(name, options);
      }

      let done = false;
      for (let i = 0, l = this.options.services.length; i < l && !done; ++i) {
        if (this.options.services[i].name === name) {
          this.options.services[i] = options;
          done = true;
        }
      }

      if (!done) {
        return PattyError.businessP(`Service "${name}" was not found`);
      }
      return this.saveConfig();
    });
  }

  /**
   * @returns {Promise}
   */
  saveConfig() {
    const options = Utils.clone(this.options);
    delete options.version;
    return Utils.writeFile(Utils.getConfigPath(this.home), JSON.stringify(options, null, '  '));
  }

  /**
   * @param {number} [retries=1]
   * @param {boolean} [bypassCache=false]
   * @returns {Promise.<boolean|PattyError>}
   */
  isServerStarted(retries, bypassCache) {
    if (retries === undefined) { retries = 1; }
    return this._tryCache('started', bypassCache ? -1 : 2000, () => {
      return this.client.pingServer({noReject: true, retries, timeout: 300, retryDelay: 300});
    });
  }

  /**
   *
   * @param {string} key
   * @param {number} maxAge if < 0, will bypass the cache
   * @param {function(): Promise.<T>} valuePromiseFunction
   * @return {Promise.<T>}
   * @template {T}
   * @private
   */
  _tryCache(key, maxAge, valuePromiseFunction) {
    /** @type {{date: Date, promise: Promise, value: *}} */
    let entry = this._cache.get(key);

    if (maxAge > 0 && entry && (Date.now() - entry.date) <= maxAge) {
      if (entry.promise) {
        return entry.promise;
      } else {
        return Promise.resolve(entry.value);
      }
    } else {
      const p = valuePromiseFunction().then(r => {
        this._cache.set(key, {date: Date.now(), promise: null, value: r});
        return r;
      });
      this._cache.set(key, {date: Date.now(), promise: p});
      return p;
    }
  }

  /**
   * @param {boolean} [fromService=false] Whether this was called from a service script
   * @returns {Promise<boolean>} true if the server was just started
   */
  ensureStarted(fromService) {
    return this.isServerStarted(undefined, true).then(started => {
      // already started, nothing to do
      if (started) { return false; }

      // needs to be started
      return this.system.isInstalled().then(installed => {
        this._logger.info(`Launching manager (service:${installed} from-service:${fromService})`);

        let p;
        if (installed && !fromService) {
          // console.log('(started:no, installed:yes) starting system-service');
          p = this.system.start().catch(err => {
            this._logger.error('Manager launch failed (as system service)', err);
            return Promise.reject(err);
          });
        } else {
          // console.log('(started:no, installed:no) spawning server');
          p = PattyServer.spawn(this.home).catch(err => {
            this._logger.error('Manager launch failed', err);
            return Promise.reject(err);
          });
        }

        return p.delay(1500).then(() => {
          return this.client.pingServer({retries: 2, timeout: 1500}).catch(e => {
            return PattyError.otherP(this.options.name + ' could not be started', e);
          });
        }).return(true);
      });
    });
  }

  /**
   * @param {string} m
   * @private
   */
  _debug(m) {
    this._logger.debug(m);
  }

  /**
   * @param {boolean} [fromService=false] Whether this was called from a service script
   * @returns {Promise<boolean>} true if the server was just killed
   */
  ensureStopped(fromService) {
    return this.isServerStarted(2).then(started => {
      // manager is not started, skip
      if (!started) {
        return false;
      }

      // 1) stop all running services
      return this.client.stopServices().then(() => {
        return this.system.isInstalled();
      }).then(installed => {

        // 2.a) if installed as a service, stop system service
        if (installed && !fromService) {
          return this.system.stop();
        }

        // 2.b) if not installed as a service, kill the manager
        return this.client.stopServices().then(() => {
          return this.client.killServer().return(true);
        });
      });
    });
  }

  /**
   * @returns {Promise<boolean>} true is newly installed
   */
  ensureInstalled() {
    return this.system.checkAdmin('install a service').then(() => {
      return this.system.isInstalled();
    }).then(installed => {
      // service already installed (nothing to do)
      if (installed) {
        return Promise.resolve(false);
      }

      // service not installed yet
      return this.isServerStarted().then(started => {
        if (started) {
          // the server is running (stopping it)
          return this.client.killServer();
        }
      }).then(() => {
        return this.system.install().then(() => {
          // start the newly installed service
          return this.system.start().delay(2000);
        });
      }).return(true);
    });
  }

  /**
   * @returns {Promise<boolean>} true if newly uninstalled
   */
  ensureUninstalled() {
    return this.system.checkAdmin('uninstall a service').then(() => {
      return this.system.isInstalled();
    }).then(installed => {
      // not installed (nothing to do)
      if (!installed) {
        return Promise.resolve(false);
      }

      // service is installed (stopping and uninstalling)
      return this.ensureStopped().then(() => {
        return this.system.uninstall();
      }).return(true);
    });
  }
}

module.exports = Patty;

/**
 * LINKURIOUS
 * Copyright Linkurious SAS 2012 - 2017
 *
 * - Created by david on 2017-03-01.
 */
'use strict';

const Promise = require('bluebird');

class MenuItem {

  /**
   * @param {string} [name]
   */
  constructor(name) {
    this._name = name || '?';

    /**
     * @type {Menu}
     * @private
     */
    this._menu = undefined;
  }

  /**
   * @returns {Menu}
   * @final
   * @protected
   */
  get menu() {
    return this._menu;
  }

  /**
   * @param {Menu} menu
   * @final
   */
  setMenu(menu) {
    this._menu = menu;
  }

  /**
   * @returns {string}
   */
  name() {
    return this._name;
  }

  /**
   * @returns {boolean}
   */
  visible() {
    return !this._menu._menuFilter || this._menu._menuFilter(this);
  }

  /**
   * @returns {null|string}
   */
  suffix() {
    return null;
  }

  /**
   * @returns {Promise}
   * @abstract
   */
  action() {
    return Promise.resolve();
  }

  /**
   * @returns {string|null}
   */
  status() {
    return null;
  }

}

module.exports = MenuItem;

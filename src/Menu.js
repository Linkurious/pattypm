/**
 * LINKURIOUS
 * Copyright Linkurious SAS 2012 - 2017
 *
 * - Created by david on 2017-02-21.
 */
'use strict';

// dependencies
const Promise = require('bluebird');
const blessed = require('blessed');
const humanize = require('humanize');
// local
const PattyError = require('./PattyError');

class Menu {

  /**
   * @param {PattyHome} home
   * @param {PattyOptions} options
   * @param {Patty} patty
   */
  constructor(home, options, patty) {
    this.home = home;
    this.options = options;

    /** @type {Patty} */
    this.patty = patty;

    /**
     * @type {{started: boolean, installed: boolean, services: Array<{name: string, state: ServiceState}>}}
     */
    this.state = {
      started: true,
      installed: false,
      processOwner: null,
      services: []
    };

    /** @type {MenuItem[]} */
    this._menuItems = [];
    this._selectedIndex = 0;
    this._menuFilter = null;
    this._addMenuItems();
  }

  /**
   * @param {MenuItem} item
   * @param {number} [index] defaults to last index
   */
  addMenuItem(item, index) {
    item.setMenu(this);
    if (index === undefined) {
      this._menuItems.push(item);
    } else {
      const items = this._menuItems;
      if (index < 0) { index = items.length - index; }
      this._menuItems = items.slice(0, index).concat([item]).concat(items.slice(index));
    }
  }

  /**
   * @private
   */
  _addMenuItems() {
    //const SeparatorItem = require('./menuItem/SeparatorItem');
    const StartItem = require('./menuItem/StartItem');
    const StopItem = require('./menuItem/StopItem');
    const InstallItem = require('./menuItem/InstallItem');
    const UninstallItem = require('./menuItem/UninstallItem');
    const StartServiceItem = require('./menuItem/StartServiceItem');
    const StopServiceItem = require('./menuItem/StopServiceItem');
    const RefreshItem = require('./menuItem/RefreshItem');
    const CloseItem = require('./menuItem/CloseItem');

    this.addMenuItem(new StartItem());
    this.addMenuItem(new StopItem());
    // this.addMenuItem(new SeparatorItem(() => this.state.started));

    // individual services control
    this.options.services.forEach(service => {
      this.addMenuItem(new StartServiceItem(service.name));
      this.addMenuItem(new StopServiceItem(service.name));
    });

    // this.addMenuItem(new SeparatorItem());
    this.addMenuItem(new InstallItem());
    this.addMenuItem(new UninstallItem());
    // this.addMenuItem(new SeparatorItem());
    this.addMenuItem(new RefreshItem());
    this.addMenuItem(new CloseItem());
  }

  /**
   * @private
   */
  _makeContent() {

    const mainBox = blessed.box({
      top: 'center',
      left: 'center',
      width: '90%',
      height: '90%',
      content: '',
      tags: true,
      border: {type: 'line'},
      style: {
        fg: '#ffffff', bg: '#0000f0',
        border: {fg: '#f0f0f0', bg: '#0000f0'}
      }
    });
    this._screen.append(mainBox);

    // loading indicator
    this._loading = blessed.loading({
      top: 'center',
      left: 'center',
      width: 15,
      height: 5,
      tags: true,
      border: {type: 'line'},
      style: {fg: 'black', bg: 'green', border: {fg: 'black', bg: 'green'}}
    });
    this._loading._.icon.left = 'center';
    this._loading._.icon.right = undefined;
    this._loading._.icon.style = {fg: 'black', bg: 'green'};
    this._screen.append(this._loading);

    // message pop-up
    this._popup = blessed.message({
      top: '30%',
      left: 'center',
      align: 'center',
      width: '80%',
      height: 6,
      hidden: true,
      content: '',
      border: {type: 'line'},
      style: {
        bg: '#ffffff', fg: '#ff0000',
        border: {bg: '#ffffff', fg: '#ff0000'}
      }
    });
    this._screen.append(this._popup);

    // error popup
    blessed.box({
      parent: this._popup,
      bg: '#ff0000', fg: '#ffffff', height: 1,
      align: 'center',
      content: '{bold}Error{/bold} - {black-fg}press {bold}[space]{/bold} to hide{/black-fg}',
      tags: true
    });

    // menu list
    this._list = this._makeList(mainBox);
    this._list.focus();

    // title
    const titleBox = blessed.box({
      parent: mainBox,
      top: 1,
      height: 4,
      content: '{center}{bold}' + this.options.name + '{/bold}\n {/center}',
      tags: true,
      style: {bg: '#0000f0', fg: '#f0f0f0'}
    });

    // status line (under menu)
    this._statusBox = blessed.box({
      parent: titleBox,
      top: 2,
      height: 1,
      content: '',
      tags: true,
      style: {bg: '#0000f0', fg: '#c0c0c0'}
    });

    // message bar (under menu)
    this._message = blessed.box({
      parent: mainBox,
      bottom: 1,
      height: 1,
      content: '',
      tags: true,
      style: {bg: '#0000f0', fg: '#a0a000'}
    });

    // key map (bottom)
    blessed.box({
      parent: mainBox,
      bottom: 0,
      height: 1,
      content: [
        '{center}',
        'Navigate: {bold}[up]{/bold} and {bold}[down]{/bold} - ',
        'Validate: {bold}[enter]{/bold} - ',
        'Quit: {bold}[esc]{/bold}, {bold}[q]{/bold} or {bold}[ctrl]+[c]{/bold}',
        '{/center}'
      ].join(''),
      tags: true,
      style: {bg: '#0000f0', fg: '#c0c0c0'}
    });
  }

  /**
   * @returns {string}
   * @private
   */
  _getStatusContent() {
    return `{center}Manager: ${Menu.colorValue(this.state.started, 'running', 'stopped')
      } - Installed as a service: ${
      Menu.colorValue(this.state.installed)
      } - Services running: ${
      Menu.colorValue(this.state.services.filter(s => s.state.started).length)
      }/${
      Menu.colorValue(this.state.services.filter(si => !si.state.disabled).length)
      }${
      this.state.processOwner ? (' - Process owner: "' + this.state.processOwner + '"') : ''
      }{/center}`;
  }

  /**
   * @returns {string}
   * @private
   */
  _getMessage() {
    return `{center}${this._getMessageText()}{/center}`;
  }

  /**
   * @returns {string}
   * @private
   */
  _getMessageText() {
    const menuItem = this._selectedMenuItem();
    return menuItem ? (menuItem.status() || '') : '';
  }

  /**
   * @param {Box} parent
   * @returns {List}
   * @private
   */
  _makeList(parent) {
    const list = blessed.list({
      parent: parent,
      top: 5, left: 2, right: 2,
      align: 'center',
      bg: '#ffffff', fg: '#0000f0',
      selectedBg: '#00ff00', selectedFg: '#000000',
      keys: true, // Allow key support (arrow keys + enter)
      vi: true // Use vi built-in keys
    });

    list.on('select item', (item, seleted) => {
      // update message
      this._selectedIndex = seleted;
      this._message.setContent(this._getMessage());
    });

    list.on('select', item => {
      //this._selectedIndex = item.position.top;
      this._doSelectedItemAction();
    });

    return list;
  }

  /**
   * @returns {MenuItem}
   * @private
   */
  _selectedMenuItem() {
    return this._menuItems.filter(menuItem => menuItem.visible())[this._selectedIndex];
  }

  /**
   * @private
   */
  _doSelectedItemAction() {
    /** @type {MenuItem} */
    const menuItem = this._selectedMenuItem();

    this._showLoading();
    menuItem.action().catch(e => {
      const pe = PattyError.other('Could not ' + menuItem.name().toLowerCase(), e);
      this.showError(pe);
    }).then(() => {
      this._hideLoading();

      return this.update().catch(e => {
        this.patty._debug('Menu update error: ' + e.message);
      });
    });
  }

  /**
   * @param {PattyError} error
   */
  showError(error) {
    this._popup.display(
      '{red-bg}{white-fg}{bold}Error{/bold}{/red-bg}{/white-fg}\n' +
      error.customFullMessage('{bold}because{/bold}'), 0
    );
  }

  _setListContent() {
    const names = this._menuItems.filter(m => m.visible()).map(
      /** @param {MenuItem} menuItem */
      (menuItem) => {
        const suffix = menuItem.suffix ? menuItem.suffix() : null;
        return menuItem.name() + (suffix ? ` (${suffix})` : '');
      }
    );
    this._list.setItems(names);
    this._list.select(this._selectedIndex >= names.length ? 0 : this._selectedIndex);
  }

  /**
   * @returns {Promise}
   */
  update() {
    return Promise.resolve().then(() => {
      this._showLoading();
      this._screen.render();
      return this._refreshState();
    }).then(() => {
      this._setListContent();

      // update status
      this._statusBox.setContent(this._getStatusContent());

      // update message
      this._message.setContent(this._getMessage());

    }).finally(() => {
      this._hideLoading();
      // Render the screen.
      this._screen.render();
    });
  }

  _showLoading() {
    this._loading.load('{center}Loading ...{/center}');
  }

  _hideLoading() {
    this._loading.stop();
  }

  /**
   * @returns {Promise}
   * @private
   */
  _refreshState() {
    return this.patty.getStatus().then(state => {
      this.state = state;
    });
  }

  /**
   * @param {function(MenuItem):boolean|null} [menuFilter=null]
   * @returns {Promise}
   */
  show(menuFilter) {
    if (typeof menuFilter === 'function') {
      this._menuFilter = menuFilter;
    }

    // init screen
    this._screen = blessed.screen({
      smartCSR: true,
      autoPadding: true,
      debug: true
    });
    this._screen.title = this.options.name;
    this._screen.key(['escape', 'q', 'C-c'], () => {
      return process.exit(0);
    });

    // make screen content
    this._makeContent();

    // display screen
    return this.update();
  }

  /**
   * Add terminal color codes around a value according to these rules:
   * - boolean: true: green, false: red
   * - other: truthy: green, falsy: yellow
   *
   * @param {string|number|boolean} v
   * @param {string} [ifTrue="yes"]
   * @param {string} [ifFalse="no"]
   * @returns {string}
   */
  static colorValue(v, ifTrue, ifFalse) {
    if (typeof v === 'boolean') {
      return `{${v ? 'green' : 'red'}-fg}${
        v ? (ifTrue || 'yes') : (ifFalse || 'no')}{/${v ? 'green' : 'red'}-fg}`;
    } else {
      return `{${v ? 'green' : 'yellow'}-fg}${v}{/${v ? 'green' : 'yellow'}-fg}`;
    }
  }
}

module.exports = Menu;

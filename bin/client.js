#!/usr/bin/env node

/**
 * LINKURIOUS
 * Copyright Linkurious SAS 2012 - 2017
 *
 * - Created by david on 2017-02-14.
 */
'use strict';

// builtin
const path = require('path');
// local
const Patty = require('../src/Patty');
const PattyError = require('../src/PattyError');

const DEBUG = process.env.DEBUG;

/**
 * @param {Error} e
 */
function handleError(e) {
  const pe = PattyError.fix(e);
  log(DEBUG ? pe.fullStack : pe.fullMessage);
  process.exit(1);
}

/**
 * @param {string} msg
 */
function log(msg) {
  console.log('PattyClient: ' + msg);
}

if (require.main === module) {

  Patty.load().then(/** @param {Patty} p */(p) => {

    const params = process.argv.slice(2);
    const action = params.shift();
    const option = params.length ? params.shift() : undefined;
    if (option && option !== '--from-service') {
      return PattyError.otherP('Unknown option: "' + option + '"');
    }
    const fromService = option === '--from-service';

    switch (action) {
      case 'status':
        return p.getStatus().then(result => {
          log(`Status: [installed:${result.installed}] [started:${result.started}]`);
          if (!result.services) { return; }
          result.services.forEach(service => {
            const state = service.state;
            const field = state.disabled
              ? 'disabled'
              : (
                state.started
                  ? 'pid'
                  : (state.exitCode ? 'exitCode' : 'restarts')
            );
            log(` - ${service.name} [running:${state.started}] [${field}:${state[field]}]`);
          });
        });

      case 'start':
        return p.ensureStarted(fromService).then(done => {
          log('Start: ' + (done ? 'done' : 'already started'));
        });

      case 'install':
        return p.ensureInstalled().then(done => {
          log('Install: ' + (done ? 'done' : 'already installed'));
        });

      case 'uninstall':
        return p.ensureUninstalled().then(done => {
          log('Un-install: ' + (done ? 'done' : 'not installed'));
        });

      case 'services-list':
        return p.ensureStarted(fromService).then(() => p.client.getServices()).then(list => {
          log('Services:\n - ' + list.join('\n - '));
        });

      case 'services-get':
        return p.client.getService(params[0]).then(service => {
          log(`Services "${params[0]}":\n` + JSON.stringify(service, null, '  '));
        });

      case 'services-start':
        return p.ensureStarted().then(() => p.client.startServices()).then(pids => {
          log('Services start: ' + pids.length + ' services started');
        });

      case 'stop':
        return p.ensureStopped(fromService).then(done => {
          log('Stop: ' + (done ? 'done' : 'no started'));
        });

      case 'restart':
        return p.ensureStopped(fromService).then(stopDone => {
          return p.ensureStarted(fromService).return(stopDone);
        }).then(stopDone => {
          log('Restart: ' + (stopDone ? 'done' : 'started'));
        });

      case undefined:
        return p.showMenu().return('menu');

      default:
        return PattyError.otherP('Unknown command: "' + action + '"');
    }

  }).then(r => {
    if (r === 'menu') {
      return;
    } else if (r === undefined) {
      log('done');
    } else {
      log('done: ' + JSON.stringify(r));
    }
  }).catch(e => handleError(e));

} else {
  throw new Error('This is meant to be run as a script');
}

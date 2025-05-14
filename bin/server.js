#!/usr/bin/env node

/**
 * LINKURIOUS
 * Copyright Linkurious SAS 2012 - 2017
 *
 * - Created by david on 2017-02-13.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const PattyServer = require('../src/PattyServer');
const PattyError = require('../src/PattyError');

/**
 * @param {Error} e
 */
function handleError(e) {
  const pe = PattyError.fix(e);
  logStartupError(pe.fullStack);
  process.exit(1);
}

/**
 * When the server fails to start before it can initialize its logger fully,
 * we catch errors here and log them to a special file to help with debugging.
 *
 * @param {string} data
 */
function logStartupError(data) {
  const Utils = require('../src/Utils');
  const configDir = path.dirname(process.env[Utils.CONFIG_PATH_ENV_KEY]);
  const logFilePath = path.resolve(configDir, 'logs', 'startup-error.log');
  fs.writeFileSync(logFilePath, new Date().toISOString() + ': ' + data + '\n', {flag: 'a'});
}

if (require.main === module) {
  // called as a script

  PattyServer.load().then(server => {
    return server.start();
  }).catch(e => handleError(e));

} else {
  // required by another module
  throw new Error('This is meant to be run as a script');
}

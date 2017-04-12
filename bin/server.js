#!/usr/bin/env node

/**
 * LINKURIOUS
 * Copyright Linkurious SAS 2012 - 2017
 *
 * - Created by david on 2017-02-13.
 */
'use strict';


const PattyServer = require('../src/PattyServer');
const PattyError = require('../src/PattyError');

/**
 * @param {Error} e
 */
function handleError(e) {
  const pe = PattyError.fix(e);
  log(pe.fullStack);
  process.exit(1);
}

/**
 * @param {string} data
 */
function log(data) {
  console.log(Date.now() + ': ' + data);
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

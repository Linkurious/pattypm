/**
 * LINKURIOUS
 * Copyright Linkurious SAS 2012 - 2017
 *
 * - Created by david on 2020-02-15.
 */
'use strict';
const process = require('process');
const path = require('path');
const {spawn} = require('child_process');

const Utils = require('../src/Utils');
const fs = require('fs-extra');

const NODE_PATH = process.argv[0];

const TestUtils = {
  runClient: (configPath, params, env) => {
    let _params = [path.resolve(__dirname, '..', 'bin/client.js')];
    if (params) {
      _params = _params.concat(params);
    }

    const _env = Object.assign(
      Utils.clone(env ? env : {}),
      {PPM_CONFIG_PATH: configPath}
    );

    //console.log(JSON.stringify(_env))
    const cp = spawn(NODE_PATH, _params, {
      env: _env,
      stdio: 'pipe'
    });
    cp.stdout.on('data', (data) => console.log('   - ' + data.toString().trim()));

    return cp;
  },

  readDelete: (p) => {
    try {
      const s1 = fs.readFileSync(p, 'utf8');
      fs.unlinkSync(p);
      return s1;
    } catch(e) {
      console.log(e);
      return undefined;
    }
  },

  makeConfig: (config) => {
    const filePath = path.resolve(
      __dirname,
      'config-tmp-' + Math.floor(Math.random() * 100000) + '.json'
    );
    fs.writeJsonSync(filePath, config);
    return filePath;
  },

  cleanUp: (configFilePath) => {
    try {
      fs.removeSync(path.resolve(__dirname, 'logs'));
      fs.removeSync(configFilePath);
    } catch(e) {
      // no op
    }
  }
};

module.exports = TestUtils;

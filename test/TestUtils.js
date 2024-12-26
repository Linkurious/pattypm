/**
 * LINKURIOUS
 * Copyright Linkurious SAS 2012 - 2017
 *
 * - Created by david on 2020-02-15.
 */
'use strict';
const process = require('node:process');
const path = require('node:path');
const {spawn, spawnSync} = require('node:child_process');

const Utils = require('../src/Utils');
const fs = require('node:fs');

const NODE_PATH = process.env.NODE || process.argv[0];

const TestUtils = {
  runClient: (configPath, command, env) => {
    const _params = [path.resolve(__dirname, '..', 'bin/client.js')];
    _params.push(command);

    const _env = Object.assign(
      Utils.clone(env ? env : {}),
      {PPM_CONFIG_PATH: configPath}
    );

    const cp = spawn(NODE_PATH, _params, {
      env: _env,
      stdio: 'pipe'
    });
    cp.on('error', (err) => {
      console.log(
        Date.now() + ' [ERR: ' + command + '|' + configPath + '] - ' + err.toString()
      );
    });
    cp.stdout.on('data', (data) => console.log(
      Date.now() + ' [LOG: ' + command + '|' + configPath + '] - ' + data.toString().trim())
    );

    return cp;
  },

  withCleanUp: (configPath, testCase) => {
    try {
      testCase();
    } catch(e) {
      console.log('Test failed, printing PPM details');
      TestUtils.catLogs();
      throw e;
    } finally {
      TestUtils.cleanUp(configPath);
    }
  },

  waitReadDelete: (p, done) => {
    const delay = 1000;
    if (fs.existsSync(p)) {
      try {
        const s1 = fs.readFileSync(p, 'utf8');
        fs.unlinkSync(p);
        done(s1);
      } catch(e) {
        console.log(e);
        done(undefined);
      }
    } else {
      console.log(`${p} does not exist yet... (Retrying to read in ` + delay + 'ms)');
      setTimeout(() => TestUtils.waitReadDelete(p, done), delay);
    }
  },

  catLogs: () => {
    console.log('cat--start');
    const c = spawnSync(
      '/bin/bash',
      ['-c', 'cat  ' + path.resolve(__dirname, 'logs/*')]
    );
    console.log(c.stdout.toString());
    console.log('cat--end');
  },

  makeConfig: (config) => {
    const filePath = path.resolve(
      __dirname,
      'config-tmp-' + Math.floor(Math.random() * 100000) + '.json'
    );
    fs.writeFileSync(filePath, JSON.stringify(config, null, 2));
    return filePath;
  },

  cleanUp: (configFilePath) => {
    try {
      fs.rmSync(path.resolve(__dirname, 'logs'));
      fs.rmSync(configFilePath);
    } catch(e) {
      // no op
    }
  }
};

module.exports = TestUtils;

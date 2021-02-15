/**
 * LINKURIOUS
 * Copyright Linkurious SAS 2012 - 2017
 *
 * - Created by david on 2017-02-13.
 */
'use strict';

const path = require('path');
const should = require('should/as-function');
const TestUtils = require('./TestUtils.js');

describe('Full stack', function() {

  it('should pass client env vars to services when cleanEnv=undefined', function(done) {
    this.timeout(5 * 1000);

    // make config file
    const configPath = TestUtils.makeConfig({
      port: 4301,
      secret: 'lol',
      name: 'PPM test',
      description: 'testing PPM',
      autoStartServices: true,
      services: [
        {
          name: 'Service ONE',
          binPath: '/bin/bash',
          arguments: ['-c', 'echo lol1:$LOL1 lol2:$LOL2 > s1.txt'],
          env: {LOL2: 'lol2-value'}
        }
      ]
    });

    // start PPM
    const cp = TestUtils.runClient(configPath, 'start', {LOL1: 'haha'});

    // stop PPM after 2 seconds
    const stop = () => {
      const cp2 = TestUtils.runClient(configPath, 'stop');
      cp2.on('exit', () => after());
    };
    setTimeout(stop, 2500);

    // after PPM has stopped
    const after = () => {
      const s1 = TestUtils.readDelete(path.resolve(__dirname, 's1.txt'));

      TestUtils.cleanUp(configPath);

      // without cleanEnv (LOL1 is passed)
      should(s1).equal('lol1:haha lol2:lol2-value\n');

      done();
    };
  });

  it('should *not* pass client env vars to services when cleanEnv=true', function(done) {
    this.timeout(5 * 1000);

    // make config file
    const configPath = TestUtils.makeConfig({
      port: 4301,
      secret: 'lol',
      name: 'PPM test',
      description: 'testing PPM',
      autoStartServices: true,
      services: [
        {
          name: 'Service ONE',
          binPath: '/bin/bash',
          cleanEnv: true,
          arguments: ['-c', 'echo lol1:$LOL1 lol2:$LOL2 > s2.txt'],
          env: {LOL2: 'lol2-value'}
        }
      ]
    });

    // start PPM
    const cp = TestUtils.runClient(configPath, 'start', {LOL1: 'haha'});

    // stop PPM after 2 seconds
    const stop = () => {
      const cp2 = TestUtils.runClient(configPath, 'stop');
      cp2.on('exit', () => after());
    };
    setTimeout(stop, 2500);

    // after PPM has stopped
    const after = () => {
      const s2 = TestUtils.readDelete(path.resolve(__dirname, 's2.txt'));

      TestUtils.cleanUp(configPath);

      // with cleanEnv:true (LOL1 is empty)
      should(s2).equal('lol1: lol2:lol2-value\n');

      done();
    };
  });
});

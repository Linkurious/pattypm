/**
 * LINKURIOUS
 * Copyright Linkurious SAS 2012 - 2017
 *
 * - Created by david on 2017-02-13.
 */
'use strict';

const assert = require('node:assert');
const os = require('node:os');
const EventEmitter = require('node:events').EventEmitter;

describe('Test utils', function() {
  const Utils = require('../src/Utils');

  describe('clone', function() {
    it('Should clone null, "" and undefined.', function() {
      assert.equal(Utils.clone(undefined), undefined);
      assert.equal(Utils.clone(null), null);
      assert.equal(Utils.clone(''), '');
    });
  });

  describe('getGID', function() {
    const username = os.userInfo().username;

    it('Should get the GID of the current user', async function() {
      const gid = await Utils.getGID(username);
      assert.equal(typeof gid,  'number');
    });

    it('Should reject when getting the GID of a non-existing user', function() {
      assert.rejects(() => Utils.getGID('non-existing-user-ever'));
    });
  });

  describe('captureLines', function() {

    it('Should handle "\\r\\n" and "\\n" line breaks.', function(done) {
      const e = new EventEmitter();
      e.setEncoding = function() {};
      const lines = [];
      Utils.captureLines(e, line => { lines.push(line.toString()); });

      e.emit('data', Buffer.from('abcdefg\n1234'));
      setTimeout(() => {
        assert.deepEqual(lines, ['abcdefg']);

        e.emit('data', Buffer.from('5\r\nxyz'));
        setTimeout(() => {
          assert.deepEqual(lines, ['abcdefg', '12345']);

          e.emit('end');
          setTimeout(() => {
            assert.deepEqual(lines, ['abcdefg', '12345', 'xyz']);

            done();
          }, 1);
        }, 1);
      }, 1);
    });

    it('Should not emit an empty line when last captured char was a line break.', function(done) {
      const e = new EventEmitter();
      e.setEncoding = function() {};
      const lines = [];
      Utils.captureLines(e, line => { lines.push(line.toString()); });

      e.emit('data', Buffer.from('abcdefg\n1234'));
      setTimeout(() => {
        assert.deepEqual(lines, ['abcdefg']);

        e.emit('data', Buffer.from('5\r\n'));
        setTimeout(() => {
          assert.deepEqual(lines, ['abcdefg', '12345']);

          e.emit('end');
          setTimeout(() => {
            assert.deepEqual(lines, ['abcdefg', '12345']);

            done();
          }, 1);
        }, 1);
      }, 1);
    });
  });

  describe('renderMoustache', function() {

    it('Should render a simple string', function() {
      const r = Utils.renderMoustache('bla', {});
      assert.equal(r, 'bla');
    });

    it('Should render a template with a var', function() {
      const r = Utils.renderMoustache('bla {{bla}} 123', {bla: 'lol'});
      assert.equal(r, 'bla lol 123');
    });

    it('Should render a template with a var twice', function() {
      const r = Utils.renderMoustache('bla {{bla}} 123 {{bla}}', {bla: 'lol'});
      assert.equal(r, 'bla lol 123 lol');
    });

  });

  describe('exec', function() {

    it('Should execute a valid command with stdout and stderr output', function() {
      const command = 'console.log("a"); process.stderr.write("MESSAGE")';
      return Utils.exec(process.argv[0] + ' -e ' + JSON.stringify(command)).then(std => {
        assert.deepEqual(std, {out: 'a\n', err: 'MESSAGE'});
      });
    });

    it('Should fail on an invalid command', function() {
      const command = 'paf';
      let ok = null;
      return Utils.exec(process.argv[0] + ' -e ' + JSON.stringify(command)).then(std => {
        ok = true;
      }).catch(e => {
        assert.equal(e.code, 1);
        assert.equal(e.killed, false);
        ok = false;
      }).then(() => {
        assert.equal(ok, false);
      });
    });

  });

  describe('run', function() {

    it('Should run a valid command with stdout and stderr output', function() {
      const args = ['-e', 'console.log("a"); process.stderr.write("MESSAGE")'];
      return Utils.run(process.argv[0], args).then(std => {
        assert.deepEqual(std, {out: 'a\n', err: 'MESSAGE'});
      });
    });

    it('Should fail on an invalid command', function() {
      const args = ['paf'];
      let ok = null;
      return Utils.run(process.argv[0], args).then(std => {
        ok = true;
      }).catch(e => {
        //console.log(e.fullMessage)
        assert.deepEqual(e.code, 1);
        ok = false;
      }).then(() => {
        assert.deepEqual(ok, false);
      });
    });

  });

});

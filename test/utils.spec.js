/**
 * LINKURIOUS
 * Copyright Linkurious SAS 2012 - 2017
 *
 * - Created by david on 2017-02-13.
 */
'use strict';

const should = require('should/as-function');
const EventEmitter = require('events').EventEmitter;

describe('Test utils', function() {

  const Utils = require('../src/Utils');

  describe('captureLines', function() {

    it('Should handle "\\r\\n" and "\\n" line breaks.', function(done) {
      const e = new EventEmitter();
      e.setEncoding = function() {};
      const lines = [];
      Utils.captureLines(e, line => { lines.push(line.toString()); });

      e.emit('data', Buffer.from('abcdefg\n1234'));
      setTimeout(() => {
        should(lines).eql(['abcdefg']);

        e.emit('data', Buffer.from('5\r\nxyz'));
        setTimeout(() => {
          should(lines).eql(['abcdefg', '12345']);

          e.emit('end');
          setTimeout(() => {
            should(lines).eql(['abcdefg', '12345', 'xyz']);

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
        should(lines).eql(['abcdefg']);

        e.emit('data', Buffer.from('5\r\n'));
        setTimeout(() => {
          should(lines).eql(['abcdefg', '12345']);

          e.emit('end');
          setTimeout(() => {
            should(lines).eql(['abcdefg', '12345']);

            done();
          }, 1);
        }, 1);
      }, 1);
    });
  });

  describe('renderMoustache', function() {

    it('Should render a simple string', function() {
      const r = Utils.renderMoustache('bla', {});
      should(r).equal('bla');
    });

    it('Should render a template with a var', function() {
      const r = Utils.renderMoustache('bla {{bla}} 123', {bla: 'lol'});
      should(r).equal('bla lol 123');
    });

    it('Should render a template with a var twice', function() {
      const r = Utils.renderMoustache('bla {{bla}} 123 {{bla}}', {bla: 'lol'});
      should(r).equal('bla lol 123 lol');
    });

  });

  describe('exec', function() {

    it('Should execute a valid command with stdout and stderr output', function() {
      const command = 'console.log("a"); process.stderr.write("MESSAGE")';
      return Utils.exec(process.argv[0] + ' -e ' + JSON.stringify(command)).then(std => {
        should(std).eql({out: 'a\n', err: 'MESSAGE'});
      });
    });

    it('Should fail on an invalid command', function() {
      const command = 'paf';
      let ok = null;
      return Utils.exec(process.argv[0] + ' -e ' + JSON.stringify(command)).then(std => {
        ok = true;
      }).catch(e => {
        should(e.code).equal(1);
        should(e.killed).equal(false);
        ok = false;
      }).then(() => {
        should(ok).equal(false);
      });
    });

  });

  describe('run', function() {

    it('Should run a valid command with stdout and stderr output', function() {
      const args = ['-e', 'console.log("a"); process.stderr.write("MESSAGE")'];
      return Utils.run(process.argv[0], args).then(std => {
        should(std).eql({out: 'a\n', err: 'MESSAGE'});
      });
    });

    it('Should fail on an invalid command', function() {
      const args = ['paf'];
      let ok = null;
      return Utils.run(process.argv[0], args).then(std => {
        ok = true;
      }).catch(e => {
        //console.log(e.fullMessage)
        should(e.code).equal(1);
        ok = false;
      }).then(() => {
        should(ok).equal(false);
      });
    });

  });

});

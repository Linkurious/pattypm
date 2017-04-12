/**
 * LINKURIOUS
 * Copyright Linkurious SAS 2012 - 2017
 *
 * - Created by david on 2017-02-10.
 */
'use strict';

const Promise = require('bluebird');

const TYPES = {
  communication: 'communication',
  protocol: 'protocol',
  business: 'business',
  other: 'other'
};

class PattyError extends Error {

  /**
   * @param {string} type
   * @param {string} message
   * @param {Error} [cause]
   */
  constructor(type, message, cause) {
    super(message);
    this.type = type;
    this.cause = cause;
  }

  /**
   * @returns {string}
   */
  get fullStack() {
    let cause = this.cause;
    let trace = this.stack;
    while (cause) {
      trace += '\n  Caused by: ' + cause.stack;
      cause = cause.cause;
    }
    return trace;
  }

  /**
   * @return {string}
   */
  get fullMessage() {
    return this.customFullMessage('[because]');
  }

  /**
   * @param {string} joiner
   * @return {string}
   */
  customFullMessage(joiner) {
    let cause = this.cause;
    let message = this.message;
    while (cause) {
      message += ' ' + joiner + ' ' + cause.message;
      cause = cause.cause;
    }
    return message;
  }

  /**
   * @param {string} messagePart
   * @returns {boolean}
   */
  matches(messagePart) {
    let error = this;
    while (error) {
      if (error.message && error.message.indexOf(messagePart) >= 0) {
        return true;
      }
      error = error.cause;
    }
    return false;
  }

  // HELPERS

  /**
   * @param {string} message
   * @param {Error} [cause]
   * @returns {PattyError}
   */
  static communication(message, cause) {
    return new PattyError(TYPES.communication, message, cause);
  }

  /**
   * @param {string} message
   * @param {Error} [cause]
   * @returns {PattyError}
   */
  static protocol(message, cause) {
    return new PattyError(TYPES.protocol, message, cause);
  }

  /**
   * @param {string} message
   * @param {Error} [cause]
   * @returns {PattyError}
   */
  static business(message, cause) {
    return new PattyError(TYPES.business, message, cause);
  }

  /**
   * @param {string} message
   * @param {Error} [cause]
   * @returns {PattyError}
   */
  static other(message, cause) {
    return new PattyError(TYPES.other, message, cause);
  }

  /**
   * @param {Error} error
   * @returns {PattyError}
   */
  static fix(error) {
    if (error instanceof PattyError) {
      return error;
    } else {
      return PattyError.other('Unknown error', error);
    }
  }

  /**
   * @param {string} message
   * @param {Error} [cause]
   * @returns {Promise.<PattyError>}
   */
  static communicationP(message, cause) {
    return Promise.reject(PattyError.communication(message, cause));
  }

  /**
   * @param {string} message
   * @param {Error} [cause]
   * @returns {Promise.<PattyError>}
   */
  static protocolP(message, cause) {
    return Promise.reject(PattyError.protocol(message, cause));
  }

  /**
   * @param {string} message
   * @param {Error} [cause]
   * @returns {Promise.<PattyError>}
   */
  static otherP(message, cause) {
    return Promise.reject(PattyError.other(message, cause));
  }

  /**
   * @param {string} message
   * @param {Error} [cause]
   * @returns {Promise.<PattyError>}
   */
  static businessP(message, cause) {
    return Promise.reject(PattyError.business(message, cause));
  }
}

module.exports = PattyError;

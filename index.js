'use strict';

var util = require('util');
var winston = require('winston');
var Transport = require('winston-transport');
var io = require('socket.io-client');
var timestamp = require('monotonic-timestamp');
var debug = require('debug')('winston-node-monitor-ui');

var NodeMonitorUi = winston.transports.NodeMonitorUI = function ({level = 'info', port = 3001, host = 'localhost'} = {}) {
  //
  // Name this logger
  //
  this.name = 'NodeMonitorUI';

  //
  // Set the level from your options
  //
  this.level = level;

  //
  // Configure your storage backing as you see fit
  //

  this.port = port;
  this.host = host;
  this._state = 'NOT_INITIALIZED';
  this.socket = undefined;
  this._queue = [];
  this._MAX_QUEUE_LENGTH = 1000;

  debug('options: %j', {port: this.port, host: this.host, level: this.level});

  this.formatLog = function (level, msg, meta) {
    return {
      level: level,
      msg: msg,
      meta: meta,
      timestamp: timestamp(),
      pid: process.pid
    };
  };
};

//
// Inherit from `winston.Transport` so you can take advantage
// of the base functionality and `.handleExceptions()`.
//
util.inherits(NodeMonitorUi, Transport);

NodeMonitorUi.prototype.log = function (level, msg, meta, callback) {
  debug('log, state: %s, level: %s, msg: %s, meta: %j', this._state, level, msg, meta);

  if (this._state === 'connected') this.socket.emit('logs', this.formatLog(level, msg, meta));
  else this._enqueue(this.formatLog(level, msg, meta));

  if (this._state === 'NOT_INITIALIZED') this._connect();

  callback(null, true);
};

NodeMonitorUi.prototype.close = function () {
  debug('close');
  if (this.socket) this.socket.disconnect();
  delete this.socket;
};

NodeMonitorUi.prototype._connect = function () {
  debug('_connect');

  this._state = 'INITIALIZING';
  this.socket = io(`http://${this.host}:${this.port}`);

  this.socket.on('connect', ()=> {
    this._state = 'connected';
    this._flushQueue();
  });

  this.socket.on('reconnect_error', () => {
    this._state = 'error';
  });

  this.socket.on('connect_timeout', () => {
    this._state = 'error';
  });

  this.socket.on('reconnect', () => {
    this._state = 'connected';
    this._flushQueue();
  });

  this.socket.on('disconnect', ()=> {
    this._state ='disconnected';
  });
};

NodeMonitorUi.prototype._enqueue = function (data) {
  debug('enqueue, data: %j, queue length: %s', data, this._queue.length);
  this._queue.push(data);
  if (this._queue.length > this._MAX_QUEUE_LENGTH) this._queue.shift();

};

NodeMonitorUi.prototype._flushQueue = function () {
  debug('flush queue, state: %s, queue length: %s', this._state, this._queue.length);
  if (this._state === 'connected' && this._queue.length > 0) {
    while (this._queue.length > 0) {
      this.socket.emit('logs', this._queue.shift());
    }
  }
};

module.exports = NodeMonitorUi;

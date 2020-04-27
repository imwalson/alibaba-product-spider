const fs = require('fs');
const dateTime = require('node-datetime');
const makeDir = require('make-dir');

makeDir('logs');
let filePath = 'log';

var log = {
  setSavePath: function(message) {
    filePath = message;
  },
  all: function (message) {
    console.log(getDate() + ' [ ALL   -  ' + prepareLogName() + '] ' + message);
    writeMessage(getDate() + ' [ ALL   -  ' + prepareLogName() + '] ' + message);
  },
  trace: function (message) {
    console.log(getDate() + ' [ TRACE -  ' + prepareLogName() + '] ' + message);
    writeMessage(getDate() + ' [ TRACE -  ' + prepareLogName() + '] ' + message);
  },
  debug: function (message) {
    console.log(getDate() + ' [ DEBUG -  ' + prepareLogName() + '] ' + message);
    writeMessage(getDate() + ' [ DEBUG -  ' + prepareLogName() + '] ' + message);
  },
  info: function (message) {
    console.log(getDate() + ' [ INFO  -  ' + prepareLogName() + '] ' + message);
    writeMessage(getDate() + ' [ INFO  -  ' + prepareLogName() + '] ' + message);
  },
  warn: function (message) {
    console.log(getDate() + ' [ WARN  -  ' + prepareLogName() + '] ' + message);
    writeMessage(getDate() + ' [ WARN  -  ' + prepareLogName() + '] ' + message);
  },
  error: function (message) {
    console.log(getDate() + ' [ ERROR -  ' + prepareLogName() + '] ' + message);
    writeMessage(getDate() + ' [ ERROR -  ' + prepareLogName() + '] ' + message);
  },
  fatal: function (message) {
    console.log(getDate() + ' [ FATAL -  ' + prepareLogName() + '] ' + message);
    writeMessage(getDate() + ' [ FATAL -  ' + prepareLogName() + '] ' + message);
  },
  off: function (message) {
    console.log(getDate() + ' [ OFF   -  ' + prepareLogName() + '] ' + message);
    writeMessage(getDate() + ' [ OFF   -  ' + prepareLogName() + '] ' + message);
  }
};

function prepareLogName() {
  return 'alibaba-spider';
}

function writeMessage(message) {
  pwd = process.cwd();
  fs.appendFileSync(filePath, message + "\n");
}

function getDate() {
  var dt = dateTime.create();
  var formatted = dt.format('m/d/Y H:M:S');
  return formatted;
}

module.exports = log;

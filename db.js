const mongoist = require('mongoist');

const DB_URL = 'mongodb://psotest:pso123@47.111.1.218:27017/alibaba_spider';
const db = mongoist(DB_URL);

module.exports = db;
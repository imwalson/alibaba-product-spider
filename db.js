const mongoist = require('mongoist');

const DB_URL = 'alibaba_spider'; // replace with your mongodb url
const db = mongoist(DB_URL);

module.exports = db;

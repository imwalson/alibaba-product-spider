const express = require('express');
const app = express();
const db = require('./db');

const resp = { success: true, data: 'your server is running!' };

app.use('/static', express.static('public'));

app.get('/', function(req, res){
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.write(JSON.stringify(resp));
  res.end();
});

app.get('/api/category_by_pid/:pid', async function(req, res){
  const pid = req.params.pid || '';
  console.log(pid);
  try {
    const doc = await db.products.findOne({ originalId: pid + '' });
    if (doc) {
      // console.log(doc);
      res.json({ success: true, data: doc });
    } else {
      res.json({ success: false, error: 'records not exist' })
    }
  } catch (error) {
    res.json({ success: false, error: error.message })
  }
});

var port = process.env.PORT || 3000;
app.listen(port, '0.0.0.0');

module.exports = app;

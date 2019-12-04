const axios = require('axios');
const url = 'https://www.alibaba.com/product-detail/Good-Quality-290mm-Cotton-Biodegradable-Sanitary_62162220379.html?bypass=true';


const headers = {
  "user-agen": 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/72.0.3596.0 Safari/537.36',
  "accept": 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8'
};

async function run() {
  try {
    const resp = await axios.get(url, { headers });
    var data = resp.data;
    let alinkStr = getStrBetween(data, '<li class="breadcrumb-item" itemprop="itemListElement" itemscope itemtype="http://schema.org/ListItem">', '<span itemprop="name">');
    console.log(alinkStr);
    let resText = getStrBetween(alinkStr, 'href="https://www.alibaba.com/', '">');
    let arr = resText.split('_');
    let obj = {};
    if(arr.length > 1) {
      let name = arr[0];
      let id = arr[1];
      obj = {id, name};
    }
    console.log(obj);
  } catch (error) {
    console.log("script error: " + error.message)
  }
}
run();

function getStrBetween(str, left, right){
  var res = '';
  var tmpArr1 = str.split(left);
  if (tmpArr1.length > 1) {
      var tmpArr2 = tmpArr1[tmpArr1.length - 1].split(right);
      if (tmpArr2.length > 1) {
          res = tmpArr2[0];
      }
  }
  return res;
}

const xlsx = require('node-xlsx');
const _ = require('lodash');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const yargs = require('yargs').argv;
const makeDir = require('make-dir');
const cheerio = require('cheerio');

const headers = {
  "user-agen": 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/72.0.3596.0 Safari/537.36',
  "accept": 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8'
};

function getArgPath() {
  return yargs['path'] || '';
}

/**
* 异步延迟
* @param {number} time 延迟的时间,单位毫秒
*/
function sleep(time = 0) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      resolve();
    }, time);
  })
};

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

function parseExcel(filePath) {
  let excelObj = xlsx.parse( path.join(__dirname, filePath)); // parses a file 
  //console.log(excelObj);
  console.log("excelObj.length = " + excelObj.length);
  let urls = []; // 产品 url 列表

  for (let ei = 0; ei < excelObj.length; ei++) {
    let sheet = excelObj[ei];
    let sheetName = sheet.name;
    let sheetData = sheet.data;
    console.log(sheetName);
    var rowCount = sheetData.length;
    for (let i = 0; i < rowCount; i++) {
      let rowData = sheetData[i];
      urls.push(rowData[0]);
    }
  }
  console.log("urls count = " + urls.length);
  console.log(urls);
  return urls;
}

async function exportExcel(data) {
  // const data = [
  //   [100001007, 'sanitary-napkin']
  // ];
  var buffer = xlsx.build([{name: "Sheet1", data: data}]); // Returns a buffer
  var random = Math.floor(Math.random()*10000+0);

  var uploadDir = './outputExcels/';
  var filePath = uploadDir + 'output-' + random + ".xlsx";

  return new Promise(function(resolve, reject){
    fs.writeFile(filePath, buffer, 'binary',function(err){
      if(err){
        console.log(err);
        reject('fs write output File error');
      }
      resolve(filePath);
    });
  })

}

async function getProductInfo(url) {
  return new Promise(function(resolve, reject){
    axios.get(url, { headers }).then((resp) => {
      const data = resp.data;
      // 获取二级类目名
      let catName = '';
      const $ = cheerio.load(data);
      let breadcrumbs = [];
      $('.breadcrumb-item .breadcrumb-link span').each(function(index,element){
        // console.log($(element).text());
        const $element = $(element);
        breadcrumbs.push(_.trim($element.text()));
      })
      // console.log('breadcrumbs');
      // console.log(breadcrumbs);
      if(breadcrumbs.length && breadcrumbs.length >= 2) {
        catName = breadcrumbs[breadcrumbs.length -2];
      }
      // 获取其他信息
      const alinkStr = getStrBetween(data, '<li class="breadcrumb-item" itemprop="itemListElement" itemscope itemtype="http://schema.org/ListItem">', '<span itemprop="name">');
      // console.log(`alinkStr=${alinkStr}`);
      let resText = getStrBetween(alinkStr, 'href="https://www.alibaba.com/', '">');
      let arr = resText.split('_');
      // console.log(arr);
      if(arr.length > 1) {
        let name = arr[0];
        let id = arr[1];
        console.log(`getProductInfo success, id=${id} ,name=${name},catName=${catName}`);
        resolve([ id, name, catName ]);
      } else {
        console.log("getProductInfo error,product info not found");
        reject()
      }
    }).catch((error) => {
      console.log("getProductInfo error: " + error.message);
      reject(error.message);
    })

  })
}
// getProductInfo('https://www.alibaba.com/product-detail/Exquisite-Royal-Blue-bone-china-tea_62311097175.html?spm=a2700.galleryofferlist.0.0.6b804fdaRvGs7p&s=p');

async function runScript() {
  try {
    await Promise.all([
      makeDir('download'),
      makeDir('inputExcels'),
      makeDir('outputExcels'),
    ]);
    const yargPath = getArgPath();
    if(!yargPath) {
      console.log('请使用 --path 设定 excel 文件路径参数');
      return;
    }
    let data = [];
    let errUrls = [];
    // 解析输入 excel 文件
    console.log('============= step 1: 解析输入文件 =============');
    const urls = parseExcel(yargPath);
    console.log(`总共${urls.length}条产品`);
    // 挨个访问产品详情页，获取结果
    console.log('============= step 2: 获取产品详情 =============');
    for(let i = 0; i < urls.length; i ++) {
      let url = urls[i];
      console.log(`开始访问第 ${i+1}/${urls.length} 个产品详情页： ${url}`);
      let info = [];
      try {
        let info = await getProductInfo(url);
        data.push(info);
        console.log('产品详情获取成功');
        console.log(info);
      } catch (e) {
        errUrls.push(url);
      }
      await sleep(2000);
    }
    // 组装并导出结果
    console.log('============= step 3: 导出结果 =============');
    const outputPath = await exportExcel(data);
    console.log(`============= 产品信息抓取成功！数量 ${data.length} =============`);
    console.log('输出文件位置：');
    console.log(outputPath);
    if(errUrls.length) {
      console.log('抓取失败产品 url 列表：');
      console.log(errUrls);
    }
  } catch (error) {
    console.log('runScript error: ' + error.message);
  }
}

runScript();

/**
* 使用方法：
* 1.存放输入文件到 inputExcels 文件夹，如 input-1.xlsx
* 2.运行命令：(input-1.xlsx 替换为实际文件名)
*   node index.js --path='./inputExcels/input-1.xlsx' 
* 3.脚本运行完毕会输出文件名，去 outputExcels 文件夹中寻找对应文件
* *
* 建议： 输入的 excel 文件不应该过大，如果过大(超过 300 行)，请分多次抓取
*/
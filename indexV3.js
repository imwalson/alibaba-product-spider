const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const xlsx = require('node-xlsx');
const _ = require('lodash');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const yargs = require('yargs').argv;
const makeDir = require('make-dir');
const shortid = require('shortid');
const jobId = shortid.generate();
const dbUtils = require('./dbUtils');
const log = require('./logUtils');
log.setSavePath(path.resolve(__dirname, 'logs', jobId + '.log'));

function getArgPath() {
  return yargs['path'] || '';
}
function getArgCurrency() {
  return yargs['currency'] || 'USD';
}
const getUserDataDir = () => {
  if (process.platform === 'win32') {
    return 'D:\\puppeteer-tmp'
  } else {
    return '/var/tmp/puppeteer/session-alibaba'
  }
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

async function initBrowser () {
  log.info('开始初始化 puppeteer');
  const browser = await puppeteer.launch({
    headless: true,
    ignoreHTTPSErrors: true,
    ignoreDefaultArgs: ["--enable-automation"],
    args: [
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--disable-setuid-sandbox',
      '--no-first-run',
      '--no-sandbox',
      '--no-zygote',
      '--single-process',
      '--user-data-dir=' + getUserDataDir()
      // "--user-data-dir=/var/tmp/puppeteer/session-alibaba"
      // "--user-data-dir=D:\\puppeteer-tmp"
    ],
    slowMo: 100, //减速显示，有时会作为模拟人操作特意减速
    devtools: false 
  });
  log.info('初始化 puppeteer 完成');
  return browser;
}

async function getNewPage(browser) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 720 });
  // 自动隐藏弹出框
  page.on('dialog', async dialog => {
    await dialog.dismiss();
  });
  // 允许权限
  const context = browser.defaultBrowserContext();
  context.overridePermissions("https://www.alibaba.com", ["geolocation", "notifications"]);
  // 开启拦截器
  await page.setRequestInterception(true);
  // abort 掉视频、图片请求，节约内存
  page.on('request', request => {
    const url = request.url().toLowerCase()
    const resourceType = request.resourceType()

    if (resourceType.toLowerCase() === "image" ||
      url.endsWith('.jpg') ||
      url.endsWith('.png') ||
      url.endsWith('.gif') ||
      url.endsWith('.jpeg') ||
      resourceType == 'media' ||
      url.endsWith('.mp4') ||
      url.endsWith('.avi') ||
      url.endsWith('.flv') ||
      url.endsWith('.mov') ||
      url.endsWith('.wmv') ||
      url.indexOf('is.alicdn.com') >= 0) {

      // log.info(`ABORTING: ${resourceType}`)
      request.abort();
    }
    else
      request.continue();
  })
  log.info('初始化 page 完成');
  return page;
}


function spliceProductUrl(pid) {
  return `https://www.alibaba.com/product-detail/_${pid}.html?bypass=true`;
}

function parseExcel(filePath) {
  let excelObj = xlsx.parse( path.join(__dirname, filePath)); // parses a file 
  //log.info(excelObj);
  log.info("excelObj.length = " + excelObj.length);
  let pids = []; // 产品 pid 列表

  for (let ei = 0; ei < excelObj.length; ei++) {
    let sheet = excelObj[ei];
    let sheetName = sheet.name;
    let sheetData = sheet.data;
    log.info(sheetName);
    var rowCount = sheetData.length;
    for (let i = 0; i < rowCount; i++) {
      let rowData = sheetData[i];
      if (rowData[0]) {
        pids.push(rowData[0]);
      }
    }
  }
  log.info("pids count = " + pids.length);
  // log.info(pids);
  return pids;
}

async function exportExcel(data) {
  var buffer = xlsx.build([{name: "Sheet1", data: data}]); // Returns a buffer
  var random = Math.floor(Math.random()*10000+0);

  var uploadDir = './outputExcels/';
  var filePath = uploadDir + 'output-' + random + ".xlsx";

  return new Promise(function(resolve, reject){
    fs.writeFile(filePath, buffer, 'binary',function(err){
      if(err){
        log.info(err);
        reject('fs write output File error');
      }
      resolve(filePath);
    });
  })

}

function getMinPrice(arr) {
  if (!arr.length) {
    return '';
  }
  arr = _.sortBy(arr, function(item) {
    return parseFloat(item.substr(1).replace(/,/g, ""));
  })
  // log.info(arr);
  return arr[0];
}

// 从详情页中解析产品价格
async function findPriceFromPage(page) {
  try {
    const priceSelectorRules = [
      '.ma-ref-price',
      '.ma-ref-price span',
      '.ma-spec-price span',
    ];
    for (let i = 0; i < priceSelectorRules.length; i ++) {
      let selector = priceSelectorRules[i];
      try {
        let prices = await page.$$eval(selector, function(eles){
          return eles.map(item => {
            let price = item.innerText;
            if (price.indexOf(' - ') >= 0) {
              price = price.split(' - ')[0];
            }
            return price;
          })
        });
        if (prices.length) {
          const minPrice = getMinPrice(prices);
          log.info('找到产品 price: ' + minPrice);
          return minPrice;
          break;
        } else {
          continue;
        }
      } catch(e) {
        continue;
      }
    }
    log.error('解析价格失败');
    return '';
  } catch(err) {
    log.error('解析价格失败');
    return '';
  }
}

// 设置价格单位 cookies
async function setPageCurrency(currency = 'USD') {
  log.info('设置汇率: ' + currency);
  let browser;
  let page;
  try {
    const url = 'https://www.alibaba.com';
    await page.waitFor(500);
    await page.goto( url, {
      waitUntil: 'domcontentloaded',
      timeout: 0
    });
    await page.waitFor(1000);
    // 获取 cookies
    // const cookies = await page.cookies(url);
    // log.info(cookies);
    await page.setCookie({
      name: 'sc_g_cfg_f',
      value: `sc_b_currency=${currency}&sc_b_locale=en_US&sc_b_site=CN`,
      domain: '.alibaba.com'
    });
    log.info('设置汇率完成');
    await page.close();
    await browser.close();
    return currency;
  } catch (error) {
    log.info('设置 cookies 失败');
    if (page) {
      await page.close();
      log.info('关闭页面');
    }
    if (browser) {
      await browser.close();
    }
    return null;
  }
}

// 从详情页中解析信息
async function parseVideoUrlFromPage(url) {
  log.info('打开产品页面: ' + url);
  let browser;
  let page;
  try {
    browser = await initBrowser ();
    page = await getNewPage(browser);
    await page.waitFor(500);
    await page.goto( url, {
      waitUntil: 'domcontentloaded',
      timeout: 0
    });
    // 设置价格单位
    const currency = getArgCurrency();
    log.info('设置价格单位: ' + currency);
    await page.setCookie({
      name: 'sc_g_cfg_f',
      value: `sc_b_currency=${currency}&sc_b_locale=en_US&sc_b_site=CN`,
      domain: '.alibaba.com'
    });
    // 刷新页面
    await page.waitFor(500);
    await page.goto( url, {
      waitUntil: 'domcontentloaded',
      timeout: 0
    });
    // 获取 cookies
    // const cookies = await page.cookies();
    // log.info(cookies);
    // 等待页面元素
    await page.waitForSelector('.bc-video-player', { timeout: 6000 }); 
    const videoUrl = await page.$eval('.bc-video-player video', ele => ele.src);
    log.info('找到视频 url: ' + videoUrl);
    const breadcrumbs = await page.$$eval('.detail-breadcrumb .breadcrumb-item .breadcrumb-link span', function(eles){
      return eles.map( item => item.innerText ) 
    }); 
    let name = breadcrumbs[breadcrumbs.length - 1];
    name = _.trim(name);
    // 找产品价格：
    const price = await findPriceFromPage(page);
    if (page) {
      await page.close();
    }
    await browser.close();
    return {videoUrl, name, price};
  } catch (error) {
    log.info('未找到视频元素');
    log.info(error);
    if (page) {
      await page.close();
      log.info('关闭页面');
    }
    if (browser) {
      await browser.close();
    }
    return null;
  }
}

async function downloadVideo (url, name, dirName) {  
  log.info(`下载视频: ${name}`);
  return new Promise((resolve, reject) => {
    try {
      const timeout = 1 * 60 * 1000; // 1 分钟超时
      const savePath = path.resolve(__dirname, dirName || 'download', name)
      log.info(`保存路径: ${savePath}`);
      const writer = fs.createWriteStream(savePath)
      axios({
        url,
        method: 'GET',
        responseType: 'stream'
      }).then((response) => {
        response.data.pipe(writer)
        writer.on('finish', resolve)
        writer.on('error', reject)
        // 超时时间
        setTimeout(() => {
          reject();
        }, timeout);
      }).catch((error) => {
        log.error('http requst error');
        reject(error.message);
      })
    } catch (error) {
      log.error('downloadVideo failed');
      log.error(error);
      reject(error.message);
    }
  })
}

function getVideoSize(link) {
  return new Promise((resolve, reject) => {
    fs.stat(link, function(error,stats){
      if(error){
        reject("file size error");
      } else{
        //文件大小
        resolve(stats.size);
      }
    })
  })
}

async function runScript() {
  try {
    await Promise.all([
      makeDir('download'),
      makeDir(`download/${jobId}`),
      makeDir('inputExcels'),
      makeDir('outputExcels'),
    ]);
    const yargPath = getArgPath();
    if(!yargPath) {
      log.info('请使用 --path 设定 excel 文件路径参数');
      return;
    }
    let data = [];
    // 解析输入 excel 文件
    log.info('============= step 1: 解析输入文件 =============');
    let pids = parseExcel(yargPath);
    // pids 排重
    pids = _.uniq(pids);
    const urls = _.map(pids, (item) => { return spliceProductUrl(item) });
    log.info(`总共${urls.length}条产品`);
    // 保存任务到 mongodb
    await dbUtils.saveJobInfo({
      shortId: jobId,
      name: `需求三：抓取数量${urls.length}，输入文件：${yargPath}`, // 任务名称
      command: `node indexV3.js --path='${yargPath}' --currency='${getArgCurrency()}'`, // 任务命令
      spideNum: urls.length,
    });
    // await setPageCurrency('INR');
    // 挨个访问产品详情页，获取视频和产品名
    log.info('============= step 2: 获取产品详情 =============');
    for(let i = 0; i < urls.length; i ++) {
      let pid = pids[i];
      let url = urls[i];
      // log.info(`开始访问第 ${i+1}/${urls.length} 个产品详情页： ${url}`);
      try {
        let videoInfo = await parseVideoUrlFromPage(url);
        log.info('videoInfo：' + JSON.stringify(videoInfo));
        if(videoInfo) {
          let videoUrl = videoInfo.videoUrl;
          let productName = videoInfo.name;
          let price = videoInfo.price;
          productName = _.trim(productName);
          productName = _.replace(productName, '/', 'or');
          // 视频 url 排重
          let videoExist = _.find(data, (item) => {
            if (item[3] && item[3] === videoUrl) {
              return true;
            } else {
              return false;
            }
          })
          let videoSavePath = path.resolve(__dirname, pathDir, pid + '_' + productName + '_' + price + '.mp4');
          if (videoExist) {
            log.info('视频 url 重复，无需下载');
          } else {
            if(productName) {
              let pathDir = `download/${jobId}/${productName}`;
              log.info('创建文件夹');
              await makeDir(pathDir);
              try {
                await downloadVideo (videoUrl, pid + '_' + productName + '_' + price + '.mp4', pathDir);
                let videoSize = 0;
                try {
                  videoSize = await getVideoSize(videoSavePath);
                } catch (error) {
                  log.info('获取视频 size 失败');
                }
                // 添加 videoUrl 和 videoSize 过滤
                let repCheck = _.find(data, (item) => {
                  if (item[3] && item[3] === videoUrl) {
                    return true;
                  } else if ( item[2] && item[4] && item[2] === price && item[4] === videoSize) {
                    return true;
                  } else {
                    return false;
                  }
                })
                if (!repCheck) {
                  let info = [ pid, productName, price, videoUrl, videoSize ];
                  data.push(info);
                  log.info('产品详情获取成功');
                } else {
                  log.info('视频重复，无需抓取');
                  // 删除重复文件
                  fs.unlink(videoSavePath, function(err){
                    if(err){
                      log.info(err);
                    }
                    log.info('重复文件删除成功！');
                  })
                }
              } catch (error) {
                let info = [ pid, 'error', "下载视频失败" ];
                data.push(info);
                log.info('下载视频失败');
                log.info(error);
              }
              // log.info(info);
            } else {
              let info = [ pid, 'error', '无产品名' ];
              data.push(info);
              log.info('无产品名');
            }
          }
        } else {
          let info = [ pid, 'error', '未找到视频' ];
          data.push(info);
          log.info('未找到视频');
        }
      } catch (e) {
        log.info(`error: ${e.message}`);
        let info = [ pid, 'error', e.message ];
        data.push(info);
      }
    }
    // 组装并导出结果
    log.info('============= step 3: 导出结果 =============');
    const dataResult = _.map(data, (item) => {
      if (item.length === 5) {
        return _.take(item, 3);
      } else {
        return item;
      }
    })
    const outputPath = await exportExcel(dataResult);
    await dbUtils.endJobSuccess(jobId, {
      excelPath: outputPath,
      videoCount: data.length
    });
    log.info(`============= 产品信息抓取成功！数量 ${data.length} =============`);
    log.info('输出文件位置：');
    log.info(outputPath);
    process.exit(0);
  } catch (error) {
    log.info('runScript error: ' + error.message);
    await dbUtils.endJobWithError(jobId, error.message);
    process.exit(-100);
  }
}

runScript();

/**
* 使用方法：
* 1.存放输入文件到 inputExcels 文件夹，如 pids1.xlsx
* 2.运行命令：(input-1.xlsx 替换为实际文件名)
*   node indexV3.js --path='./inputExcels/pids1.xlsx'  --currency='USD'
* 3.脚本运行完毕会输出文件名，去 outputExcels 文件夹中寻找对应文件
* *
* 建议： 输入的 excel 文件不应该过大，如果过大(超过 300 行)，请分多次抓取
*/
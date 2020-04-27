// 爬取 alibaba 详情页视频
const puppeteer = require('puppeteer');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const _ = require('lodash');
const yargs = require('yargs').argv;
const xlsx = require('node-xlsx');
const makeDir = require('make-dir');
const url = require('url');
const shortid = require('shortid');
const jobId = shortid.generate();
const dbUtils = require('./dbUtils');
const log = require('./logUtils');
log.setSavePath(path.resolve(__dirname, 'logs', jobId + '.log'));

const itemSelector = `.m-gallery-product-item-v2`;
const videoMarkSelector = '.seb-img-switcher__icon-video';
const videoMarkSelector2 = '.watermark.has-video';
const itemLinkSelector = 'a.organic-gallery-offer__img-section';
const headers = {
  "user-agen": 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/72.0.3596.0 Safari/537.36',
  "accept": 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8'
};

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
    log.info('解析价格失败');
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
    browser = await initBrowser ();
    page = await getNewPage(browser);
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
      domain: '.alibaba.com',
      path: '/',
      expires: 3726915447.990282,
    });
    log.info('设置汇率完成');
    await page.close();
    await browser.close();
    return currency;
  } catch (error) {
    log.error('设置 cookies 失败');
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
    await page.waitFor(1000);
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
    try {
      await page.waitForSelector('.bc-video-player', { timeout: 30000 }); 
    } catch (error) {
      log.error('未找到视频元素');
      return null;
    }
    const videoUrl = await page.$eval('.bc-video-player video', ele => ele.src);
    log.info('找到视频url: ' + videoUrl);
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
    return {videoUrl, name, price};
  } catch (error) {
    log.error('未找到视频元素');
    log.error(error);
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

async function downloadVideo (url, name) {  
  log.info(`下载视频: ${name}`);
  const savePath = path.resolve(__dirname, 'download', name)
  const writer = fs.createWriteStream(savePath)

  const response = await axios({
    url,
    method: 'GET',
    responseType: 'stream'
  })

  response.data.pipe(writer)

  return new Promise((resolve, reject) => {
    writer.on('finish', resolve)
    writer.on('error', reject)
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

async function exportExcel(data, isVideo) {
  const buffer = xlsx.build([{name: "Sheet1", data: data}]); // Returns a buffer
  const random = Math.floor(Math.random()*10000+0);
  const date = new Date();
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate(); 
  const h = date.getHours();
  const m = date.getMinutes();
  const s = date.getSeconds(); 

  const uploadDir = './outputExcels/';
  let filePath = `${uploadDir}pid-${year}-${month}-${day}-${h}:${m}:${s}-${random}.xlsx`;
  if(isVideo) {
    filePath = `${uploadDir}pid_and_video-${year}-${month}-${day}-${h}:${m}:${s}-${random}.xlsx`;
  }

  return new Promise(function(resolve, reject) {
    fs.writeFile(filePath, buffer, 'binary',function(err){
      if(err){
        log.error(err);
        reject('fs write output File error');
      }
      resolve(filePath);
    });
  })

}

function changeURLArg(url, arg, arg_val) {
  var pattern = arg + '=([^&]*)';
  var replaceText = arg + '=' + arg_val;
  if (url.match(pattern)) {
    var tmp = '/(' + arg + '=)([^&]*)/gi';
    tmp = url.replace(eval(tmp), replaceText);
    return tmp;
  } else {
    if (url.match('[\?]')) {
      return url + '&' + replaceText;
    } else {
      return url + '?' + replaceText;
    }
  }
  return url + '\n' + arg + '\n' + arg_val;
}

// 从列表页中找出指定数量的产品，递归调用
let allProducts = [];
async function findProductListFromPage(listUrl, num, callback) {
  let browser = await initBrowser();
  let page = await getNewPage(browser);
  await page.goto( listUrl, {
    waitUntil: 'domcontentloaded',
    timeout: 0
  });
  await page.waitFor(2000);
  const data = await page.content();
  const $ = cheerio.load(data);
  let products = [];
  // log.info($(itemSelector).length);
  $(itemSelector).each(function(index,element){
    const $element = $(element);
    let obj = {};
    let hasVideo;
    let hasVideo1 = $element.find(videoMarkSelector).first().length;
    let hasVideo2 = $element.find(videoMarkSelector2).first().length;
    if(!hasVideo1 && !hasVideo2) {
      hasVideo = false;
    } else {
      hasVideo = true;
    }
    let linkEle = $element.find(itemLinkSelector).first();
    let itemLink = linkEle && linkEle.attr('href');
    let domdot = linkEle && linkEle.attr('data-domdot');
    let domdotArr = domdot.split(',');
    let pid = '';
    domdotArr.forEach( (item) => {
      let arr = item.split(':');
      if(arr[0] === 'pid') {
        pid = arr[1];
      }
    })
    if(!pid){
      log.info(`第${index + 1}个产品未找到 pid`);
    }
    // log.info(`---- hasVideo: ${hasVideo} ----`);
    // log.info(`---- itemLink: ${itemLink} ----`);
    
    obj.hasVideo = hasVideo;
    obj.itemLink = 'http:' + itemLink;
    obj.pid = pid;
    obj.create_at = (new Date()).toLocaleString();
    // log.info(obj);

    products.push(obj);
  })
  products = _.filter(products, 'hasVideo');
  log.info(`本页包含视频的产品实际数量: ` + products.length);
  // log.info(products);
  var needMore = (num > products.length) ? true : false;
  var moreNum = needMore && (num - products.length);
  let toSpide = _.take(products, num);
  // log.info(toSpide);
  toSpide = _.filter(toSpide,function(p){ return p.pid });
  // 是否还有下一页
  let currentPage = url.parse(listUrl, {parseQueryString: true}).query.page || 1;
  currentPage = parseInt(currentPage);
  log.info('currentPage=' + currentPage);
  let nextEle = $('.ui2-pagination-pages>.next');
  // log.info('下一页dom元素：');
  // log.info(nextEle);
  // let hasNext = nextEle.length ? true : false;
  let nextPageUrl = changeURLArg(listUrl, 'page', currentPage + 1);
  allProducts = _.union(allProducts, toSpide);
  // let results = {
  //   needMore: needMore,
  //   moreNum: moreNum,
  //   nextPageUrl: nextPageUrl
  // }
  // log.info(results);
  if(needMore) {
    log.info('产品数量不足，下一页 url:' + nextPageUrl);
    // if (page) {
    //   await page.close();
    // }
    if (browser) {
      await browser.close();
    }
    await sleep(2000);
    findProductListFromPage(nextPageUrl, moreNum, callback);
  } else {
    // if (page) {
    //   await page.close();
    // }
    if (browser) {
      await browser.close();
    }
    callback && callback();
  }
  
}

function fancyTimeFormat(time)
{   
    // Hours, minutes and seconds
    var hrs = ~~(time / 3600);
    var mins = ~~((time % 3600) / 60);
    var secs = ~~time % 60;

    // Output like "1:01" or "4:03:59" or "123:03:59"
    var ret = "";

    if (hrs > 0) {
        ret += "" + hrs + ":" + (mins < 10 ? "0" : "");
    }

    ret += "" + mins + ":" + (secs < 10 ? "0" : "");
    ret += "" + secs;
    return ret;
}

async function main(toSpideProducts, startTime) {
  try {
    await Promise.all([
      makeDir('download'),
      makeDir('inputExcels'),
      makeDir('outputExcels'),
      makeDir('logs'),
    ]);
    // 设置汇率
    // await setPageCurrency('INR');
    // toSpideProducts 排重
    toSpideProducts = _.uniq(toSpideProducts);
    await exportExcel(toSpideProducts.map( (item) => { return [item.pid, item.itemLink] }))
    // log.info('待抓取列表');
    // log.info(toSpideProducts);
    const len = toSpideProducts.length;
    let dataList = [];
    for (let i=0; i<len; i++) {
      let product = toSpideProducts[i];
      try {
        let videoInfo = await parseVideoUrlFromPage(product.itemLink);
        let videoUrl = videoInfo.videoUrl;
        let productName = videoInfo.name;
        let price = videoInfo.price;
        // 视频 url 排重
        let videoExist = _.find(dataList, (item) => {
          if (item[3] && item[3] === videoUrl) {
            return true;
          } else {
            return false;
          }
        })
        if (videoExist) {
          log.info('视频 url 重复，无需下载');
        } else {
          await downloadVideo (videoUrl, product.pid + '_' + productName + '_' + price + '.mp4');
          let videoSize = 0;
          try {
            videoSize = await getVideoSize(path.resolve(__dirname, 'download', product.pid + '_' + productName + '_' + price + '.mp4'));
          } catch (error) {
            log.error('获取视频 size 失败');
          }
          // 添加 videoUrl 和 videoSize 以过滤
          let repCheck = _.find(dataList, (item) => {
            if (item[3] && item[3] === videoUrl) {
              return true;
            } else if ( item[4] && item[5] && item[4] === price && item[5] === videoSize) {
              return true;
            } else {
              return false;
            }
          })
          if (!repCheck) {
            const pArr = [product.pid, productName, product.itemLink, videoUrl, price, videoSize];
            dataList.push(pArr);
            log.info('产品详情获取成功');
            // log.info(pArr);
          } else {
            log.info('视频重复，无需抓取');
            // 删除重复文件
            fs.unlink(path.resolve(__dirname, 'download', product.pid + '_' + productName + '_' + price + '.mp4'), function(err){
              if(err){
                log.error(err);
              }
              log.info('重复文件删除成功！');
            })
          }
        }
      } catch (error) {
        log.error('error:');
        log.error(error);
        dataList.push([product.pid, product.itemLink, 'error']);
      }
    }
    log.info('任务抓取成功!');
    if(startTime) {
      var end = (new Date()).getTime();
      var using = (end - startTime) / 1000;
      log.info('总用时: ' + fancyTimeFormat(using));
    }
    const dataResult = _.map(dataList, (item) => {
      if (item.length === 6) {
        return _.take(item, 5);
      } else {
        return item;
      }
    })
    const excelPath = await exportExcel(dataResult, true);
    // await browser.close();
    await dbUtils.endJobSuccess(jobId, {
      time: fancyTimeFormat(using),
      excelPath: excelPath,
      videoCount: dataResult.length
    });
    process.exit(0);
  } catch (e) {
    log.info('任务抓取失败!');
    log.info(e.message);
    await dbUtils.endJobWithError(jobId, e.message);
    // await browser.close();
    process.exit(-100);
  }
}

async function run() {
  var startTime = (new Date()).getTime();
  const listUrl = yargs['listurl'] || '';
  let num = yargs['num'] || 5;
  num = parseInt(num);
  if(!listUrl) {
    log.info('缺少参数：listurl');
    return;
  }
  if(!num) {
    log.info('num');
    return;
  }
  log.info(`产品抓取目标数量: ` + num);
  // 保存任务到 mongodb
  await dbUtils.saveJobInfo({
    shortId: jobId,
    name: `需求二：抓取数量${num}，列表页：${listUrl}`, // 任务名称
    command: `node video-spider.js --listurl='${listUrl}' --num=${num}  --currency='${getArgCurrency()}'`, // 任务命令
    spideNum: num,
  });
  findProductListFromPage(listUrl, num, function(){
    main(allProducts, startTime)
  });
}

run();

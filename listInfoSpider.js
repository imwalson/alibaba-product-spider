/**
 * 抓取品类列表页信息
 * node listInfoSpider.js --listurl='https://www.alibaba.com/catalog/dinnerware_cid100004988?spm=a272h.12677575.channel_image_category.4.ccdc60c6QS3fRu' --num=5  --currency='INR'
 */
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const _ = require('lodash');
const yargs = require('yargs').argv;
const url = require('url');
const shortid = require('shortid');
const db = require('./db');
const jobId = shortid.generate();
const dbUtils = require('./dbUtils');
const log = require('./logUtils');
log.setSavePath(path.resolve(__dirname, 'logs', jobId + '.log'));

const utils = require('./utils');
const timeoutPromise = require('./timeout-promise');
let nextUrl = ''; // 下一页的 url
let count = 0; // 已经抓取的数量

const itemSelector = `.m-gallery-product-item-v2`;
const videoMarkSelector = '.seb-img-switcher__icon-video';
const videoMarkSelector2 = '.watermark.has-video';
const itemLinkSelector = 'a.organic-gallery-offer__img-section';

process.setMaxListeners(Infinity); // Fix "MaxListenersExceededWarning"

function getArgCurrency() {
  return yargs['currency'] || 'USD';
}
function getUserDataDir() {
  if (process.platform === 'win32') {
    return 'D:\\puppeteer-tmp'
  } else {
    return '/var/tmp/puppeteer/session-alibaba'
  }
}

async function initBrowser () {
  log.info('开始初始化 puppeteer');
  try {
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
  } catch (error) {
    log.info('初始化 puppeteer 失败');
    throw error;
  }
}

async function getNewPage(browser) {
  try {
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
  } catch (error) {
    log.info('初始化 page 失败');
    throw error;
  }
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
    log.error(err);
    return '';
  }
}


// 从详情页中解析信息
async function parseVideoUrlFromPage(url) {
  log.info('打开产品页面: ' + url);
  let browser;
  let page;
  try {
    browser = await initBrowser();
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
    // 等待页面元素
    try {
      await page.waitForSelector('.bc-video-player', { timeout: 30000 }); 
    } catch (error) {
      log.error('未找到视频元素');
      return null;
    }
    // 解析所需信息
    const pinfo = utils.parseProductInfoFromUrl(url);
    const { productName } = pinfo;
    const { originalId } = pinfo;
    const videoUrl = await page.$eval('.bc-video-player video', ele => ele.src);
    log.info('找到视频url: ' + videoUrl);
    let breadcrumbs = await page.$$eval('.detail-breadcrumb .breadcrumb-item .breadcrumb-link span', function(eles){
      return eles.map( item => item.innerText ) 
    }); 
    breadcrumbs = breadcrumbs.map( text => {
      let result = _.trim(text);
      result = result.replace(/-/g, '');
      result = result.replace(/&/g, '');
      result = result.replace(/ /g, '');
      return result;
    })
    const category3 = breadcrumbs[breadcrumbs.length - 1] || '';
    const category2 = breadcrumbs[breadcrumbs.length - 2] || '';
    const category1 = breadcrumbs[breadcrumbs.length - 3] || '';
    // 找产品价格：
    const price = await findPriceFromPage(page);
    if (page) {
      await page.close();
    }
    object = {
      originalId,
      productName,
      hasVideo: true,
      videoUrl,
      category1,
      category2,
      category3,
    };
    object[`price_${currency}`] = price;
    return object;
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

// 从列表页中找出指定数量的产品
async function findProductListFromPage() {
  await dbUtils.updateJobListUrl(jobId, nextUrl);
  try {
    let browser = await initBrowser();
    let page = await getNewPage(browser);
    await page.goto( nextUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 0
    });
    await page.waitFor(2000);
    // TODO: 页面向下滚动获取更多商品
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
    // log.info(toSpide);
    let toSpide = _.filter(products,function(p){ return p.pid });
    // 下一页 url
    let currentPage = url.parse(nextUrl, {parseQueryString: true}).query.page || 1;
    currentPage = parseInt(currentPage);
    log.info('currentPage=' + currentPage);
    // let nextEle = $('.ui2-pagination-pages>.next');
    // log.info('下一页dom元素：');
    // log.info(nextEle);
    // let hasNext = nextEle.length ? true : false;
    nextUrl = changeURLArg(nextUrl, 'page', currentPage + 1);
    return toSpide;
  } catch (error) {
    log.error('findProductListFromPage error');
    log.error(error);
    return [];
  }
}
// 设置超时时间，超时直接退出脚本
let findProductListFromPageTimed = timeoutPromise(60000, findProductListFromPage())

// 抓取一页的视频，递归调用
async function main(num) {
  try {
    // 获取当前页的视频产品列表
    let toSpideProducts = [];
    try {
      toSpideProducts = await findProductListFromPageTimed();
    } catch (error) {
      if (error === 'promise timeout') {
        // 超时后退出脚本
        log.info('任务处理超时!');
        await dbUtils.endJobWithError(jobId, 'job timeout!');
        process.exit(-60);
      }
    }

    // toSpideProducts 排重
    toSpideProducts = _.uniq(toSpideProducts);
    const len = toSpideProducts.length;
    for (let i=0; i<len; i++) {
      let product = toSpideProducts[i];
      try {
        const { originalId } = utils.parseProductInfoFromUrl(product.itemLink);
        // 数据库查重（根据商品 ID 加 价格单位）
        const condition = { originalId };
        condition[`price_${getArgCurrency()}`] = { $exists: true };
        // log.info('查询条件:');
        // log.info(JSON.stringify(condition));
        const docExist = await db.products.findOne(condition);
        let productInfo = {};
        // 设置超时时间，超时直接退出脚本
        let parseVideoUrlFromPageTimed = timeoutPromise(60000, parseVideoUrlFromPage(product.itemLink))
        try {
          productInfo = await parseVideoUrlFromPageTimed();
        } catch (error) {
          if (error === 'promise timeout') {
            // 超时后退出脚本
            log.info('任务处理超时!');
            await dbUtils.endJobWithError(jobId, 'job timeout!');
            process.exit(-60);
          }
        }
        if (docExist) {
          log.info('当前国别商品已抓取，无需重复抓取');
          count ++; // 计数器加一
          // 如果数量已经足够，直接结束
          if (count >= num) {// 数量足够，停止任务
            log.info('任务抓取成功!');
            process.exit(0);
          }
        } else {
          log.info('需要新抓取');
          await dbUtils.cacheProductInfo({
            ...productInfo,
            ...{ jobId },
          });
          // log.info(pArr);
          count ++; // 计数器加一
          // 如果数量已经足够，直接结束
          if (count >= num) {// 数量足够，停止任务
            log.info('任务抓取成功!');
            process.exit(0);
          }
        }
      } catch (error) {
        log.error('error:');
        log.error(error);
      }
      log.info(`任务完成度: ${count}/${num}`);
    }

    // 数量不够，递归调用
    if (count < num) {
      log.info('继续抓取下一页');
      await main(num);
    } else {
      // 数量足够，停止任务
      log.info('任务抓取成功!');
      // await browser.close();
      await dbUtils.endJobSuccess(jobId);
      process.exit(0);
    }
  } catch (e) {
    log.error('任务抓取失败!');
    log.error(e.message);
    await dbUtils.endJobWithError(jobId, e.message);
    // await browser.close();
    process.exit(-100);
  }
}

async function run() {
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
  // 保存任务到 mongodb
  await dbUtils.saveJobInfo({
    shortId: jobId,
    name: `抓取列表商品信息：抓取数量${num}，列表页：${listUrl}，国别：${getArgCurrency()}`, // 任务名称
    command: `node listInfoSpider.js --listurl='${listUrl}' --num=${num}  --currency='${getArgCurrency()}'`, // 任务命令
    spideNum: num,
  });
  nextUrl = listUrl; // 初始页面目标
  log.info(`产品抓取目标数量: ` + num);
  await main(num);
}

run();

/**
 * 获取有效视频列表
 * node validVideoFilter.js
 */
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const fs = require('fs');
const _ = require('lodash');
const path = require('path');
const makeDir = require('make-dir');
const db = require('./db');
const utils = require('./utils');

const dateString = utils.getDateTimeString();
const itemSelector = `.m-gallery-product-item-v2`;
const itemLinkSelector = 'a.organic-gallery-offer__img-section';

function getUserDataDir() {
  if (process.platform === 'win32') {
    return 'D:\\puppeteer-tmp'
  } else {
    return '/var/tmp/puppeteer/session-alibaba'
  }
}

async function initBrowser () {
  console.log('开始初始化 puppeteer');
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
      // slowMo: 100, //减速显示，有时会作为模拟人操作特意减速
      devtools: false 
    });
    console.log('初始化 puppeteer 完成');
    return browser;
  } catch (error) {
    console.log('初始化 puppeteer 失败');
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

        // console.log(`ABORTING: ${resourceType}`)
        request.abort();
      }
      else
        request.continue();
    })
    console.log('初始化 page 完成');
    return page;
  } catch (error) {
    console.log('初始化 page 失败');
    throw error;
  }
}

// 从列表页中找出一个
async function findProductListFromPage(listUrl) {
  try {
    let browser = await initBrowser();
    let page = await getNewPage(browser);
    await page.goto(listUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 0
    });
    await page.waitFor(1000);
    const data = await page.content();
    const $ = cheerio.load(data);
    let products = [];
    // console.log($(itemSelector).length);
    $(itemSelector).each(function(index,element){
      const $element = $(element);
      let obj = {};
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
        console.log(`第${index + 1}个产品未找到 pid`);
      }
      obj.itemLink = 'http:' + itemLink;
      obj.pid = pid;

      products.push(obj);
    })
    let toSpide = _.filter(products,function(p){ return p.pid });
    return toSpide;
  } catch (error) {
    console.log('findProductListFromPage error');
    console.log(error);
    return [];
  }
}

// 从详情页中解析信息
async function parseVideoInfoFromPage(url) {
  console.log('打开产品页面: ' + url);
  let browser;
  let page;
  try {
    browser = await initBrowser();
    page = await getNewPage(browser);
    await page.waitFor(500);
    await page.goto( url, {
      waitUntil: 'domcontentloaded',
      timeout: 0
    });
    await page.waitFor(500);
    // 解析所需信息
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
    // console.log('breadcrumbs');
    // console.log(JSON.stringify(breadcrumbs));
    const category1 = breadcrumbs[2] || '';
    const category2 = breadcrumbs[3] || '';
    const category3 = breadcrumbs[4] || '';
    const category4 = breadcrumbs[5] || '';
    let breadcrumbLiks = await page.$$eval('.detail-breadcrumb .breadcrumb-item .breadcrumb-link', function(eles){
      return eles.map( item => item.href ) 
    });
    // console.log('breadcrumbLiks');
    // console.log(JSON.stringify(breadcrumbLiks));
    const category1Link = breadcrumbLiks[2] || '';
    const category2Link = breadcrumbLiks[3] || '';
    const category3Link = breadcrumbLiks[4] || '';
    const category4Link = breadcrumbLiks[5] || '';
    const category1Id = category1Link ? utils.parseAlibabaLinkId(category1Link) : '';
    const category2Id = category2Link ? utils.parseAlibabaLinkId(category2Link) : '';
    const category3Id = category3Link ? utils.parseAlibabaLinkId(category3Link) : '';
    const category4Id = category4Link ? utils.parseAlibabaLinkId(category4Link) : '';
    object = {
      category1,
      category2,
      category3,
      category4,
      category1Link,
      category2Link,
      category3Link,
      category4Link,
      category1Id,
      category2Id,
      category3Id,
      category4Id,
    };
    return object;
  } catch (error) {
    console.log('未找到产品信息');
    console.log(error);
    if (page) {
      await page.close();
      console.log('关闭页面');
    }
    if (browser) {
      await browser.close();
    }
    return null;
  }
}

// 根据产品列表页获取商品品类信息
async function getCategoriesByListUrl(listUrl) {
  try {
    const toSpideProducts = await findProductListFromPage(listUrl);
    // console.log(toSpideProducts);
    if (toSpideProducts.length) {
      const product = toSpideProducts[0];
      // console.log(product);
      let productInfo = await parseVideoInfoFromPage(product.itemLink);
      // console.log(productInfo);
      return {
        category1: productInfo.category1,
        category2: productInfo.category2,
        category3: productInfo.category3,
      };
    } else {
      console.log('列表页没有商品');
    }
  } catch (error) {
    console.log('根据产品列表页获取商品品类信息失败');
    console.log(error);
  }
}
// getCategoriesByListUrl('https://www.alibaba.com/catalog/razor_cid100001042');

async function findListProducts({
  category1,
  category2,
  category3,
  currency,
}) {
  const condition = {
    downloaded: true,
    category1,
    category2,
    category3,
  };
  condition[`price_${currency}`] = { $exists: true };
  const docs = await db.products.findAsCursor(condition)
  .sort({ '_id': 1 })
  .toArray();
  console.log(`待导出总数量： ${docs.length}`);
  return docs;
}

// 过滤有效视频
async function filtVideoDocs(products) {
  const videoUrls = _.map(products, "videoUrl");
  const docs = await db.productVideos.findAsCursor({
    // videoWidth: { $gte: 480 },
    // $where : "this.videoHeight >= this.videoWidth",
    // videoSize: { $gte: 2 * 1024 * 1024 },
    videoUrl: { $in: videoUrls }
  })
  .sort({ '_id': 1 })
  .toArray();
  console.log(`有效数量： ${docs.length}`);
  return docs;
}

async function copyVideo(input, output) {
  var readStream = fs.createReadStream(input);
  var writeStream = fs.createWriteStream(output);
  readStream.pipe(writeStream);

  return new Promise((resolve, reject) => {
    writeStream.on('finish', resolve)
    writeStream.on('error', reject)
  })
}

async function exportVideos({ currency }) {
  const videoDocs = await filtVideoDocs();
  try {
    await Promise.all([
      makeDir('download'),
      makeDir(`download/${dateString}`),
    ]);
    for (let i = 0; i < videoDocs.length; i ++) {
      let videoDoc = videoDocs[i];
      // 历史排重
      const saved = await db.validVideos.findOne({ videoUrl:videoDoc.videoUrl, currency });
      if (saved) {
        console.log('重复视频，无需重复筛选');
      } else {
        console.log('找到新视频');
        const productInfo = await db.products.findOne({ videoUrl: videoDoc.videoUrl });
        if (productInfo) {
          const inputPath = videoDoc.videoPath;
          const outputPath = path.resolve(__dirname, `download/${dateString}`, productInfo.originalId + '_' + productInfo.category3 + '_' + productInfo[`price_${currency}`] + '.mp4');
          await copyVideo(inputPath, outputPath);
          console.log('视频拷贝完毕');
          // 保存已筛选视频到数据库（方便历史排重）
          await db.validVideos.insert({
            originalId: productInfo.originalId, // 视频原 ID
            currency: currency, // 国别
            videoUrl: videoDoc.videoUrl, // 视频文件 url
            videoPath: inputPath, // 视频文件原路径
            newPath: outputPath, // 视频文件复制到的新路径
            videoSize: videoDoc.videoSize, // 视频文件大小
            videoWidth: videoDoc.videoWidth, // 视频文件宽
            videoHeight: videoDoc.videoHeight, // 视频文件高
            createAt: new Date(),
            updateAt: new Date(),
          });
          console.log('有效视频保存到数据库完毕');
        } else {
          console.log('未找到产品信息');
        }
      }
    }
    console.log('视频全部筛选成功!');
    process.exit(0);
  } catch (error) {
    console.log('任务抓取失败!');
    console.log(error);
    process.exit(-100);
  }
}

// exportVideos({
//   currency: 'EGP'
// });



// 主函数
async function exportValidVideos(listUrl, currency) {
  try {
    const categories = await getCategoriesByListUrl(listUrl);
    const productDocs = await findListProducts({
      category1: categories.category1,
      category2: categories.category2,
      category3: categories.category3,
      currency,
    })
    await Promise.all([
      makeDir('download'),
      makeDir(`download/${dateString}`),
      makeDir(`download/${dateString}/${categories.category3}_${currency}`),
    ]);
    const videoDocs = await filtVideoDocs(productDocs);
    for (let i = 0; i < productDocs.length; i ++) {
      let productInfo = productDocs[i];
      let videoName = productInfo.originalId + '_' + productInfo.category3 + '_' + productInfo[`price_${currency}`] + '.mp4';
      let outputPath = path.resolve(__dirname, `download/${dateString}/${categories.category3}_${currency}`, videoName);
      // 历史排重
      const saved = await db.validVideos.findOne({ videoName });
      if (saved) {
        console.log('重复视频，无需重复筛选');
      } else {
        console.log('找到新视频');
        // 是否存在视频文件
        const videoDoc = _.find(videoDocs, { videoUrl: productInfo.videoUrl });
        if (!videoDoc) {
          console.log('视频未下载');
          console.log(productInfo);
        } else {
          const inputPath = videoDoc.videoPath;
          // console.log('debug');
          await copyVideo(inputPath, outputPath);
          console.log('视频拷贝完毕');
          // 保存已筛选视频到数据库（方便历史排重）
          await db.validVideos.insert({
            originalId: productInfo.originalId, // 视频原 ID
            category1: productInfo.category1,
            category2: productInfo.category2,
            category3: productInfo.category3,
            videoName: videoName,
            currency: currency, // 国别
            videoUrl: videoDoc.videoUrl, // 视频文件 url
            videoPath: inputPath, // 视频文件原路径
            newPath: outputPath, // 视频文件复制到的新路径
            videoSize: videoDoc.videoSize, // 视频文件大小
            videoWidth: videoDoc.videoWidth, // 视频文件宽
            videoHeight: videoDoc.videoHeight, // 视频文件高
            createAt: new Date(),
            updateAt: new Date(),
          });
          console.log('有效视频保存到数据库完毕');
        }
      }
    }
    console.log('视频全部筛选成功!');
    process.exit(0);
  } catch (error) {
    console.log('任务抓取失败!');
    console.log(error);
    process.exit(-100);
  }
}


exportValidVideos('https://www.alibaba.com/catalog/razor_cid100001042', 'TRY');
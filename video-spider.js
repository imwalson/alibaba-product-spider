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

const itemSelector = `.m-gallery-product-item-v2`;
const videoMarkSelector = '.seb-img-switcher__icon-video';
const videoMarkSelector2 = '.watermark.has-video';
const itemLinkSelector = 'a.organic-gallery-offer__img-section';
const headers = {
  "user-agen": 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/72.0.3596.0 Safari/537.36',
  "accept": 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8'
};

async function initBrowser () {
  console.log('开始初始化 puppeteer');
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
      '--single-process'
    ],
    slowMo: 100, //减速显示，有时会作为模拟人操作特意减速
    devtools: false 
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 720 });
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
      url.endsWith('.wmv')) {

      // console.log(`ABORTING: ${resourceType}`)
      request.abort();
    }
    else
      request.continue();
  })
  console.log('初始化 puppeteer 完成');
  return {page,browser};
}

async function parseVideoUrlFromPage(page, url) {
  console.log('打开产品页面: ' + url);
  await page.goto( url, {
    waitUntil: 'domcontentloaded'
  });
  // 等待页面元素
  try {
    await page.waitForSelector('.bc-video-player', { timeout: 10000 }); 
  } catch (error) {
    console.log('未找到视频元素');
    return null;
  }
  const videoUrl = await page.$eval('.bc-video-player video', ele => ele.src);
  console.log('找到视频url: ' + videoUrl);
  return videoUrl;
}

async function downloadVideo (url, name) {  
  console.log(`下载视频，pid: ${name}`);
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
        console.log(err);
        reject('fs write output File error');
      }
      resolve(filePath);
    });
  })

}

async function findProductList(page, listUrl, num) {
  // const page = await initBrowser();
  console.log(`子类产品列表地址: ` + listUrl);
  console.log(`产品抓取目标数量: ` + num);
  // const resp = await axios.get(listUrl, { headers });
  // const data = resp.data;
  await page.goto( listUrl, {
    waitUntil: 'domcontentloaded'
  });
  await page.waitFor(2000);
  const data = await page.content();
  const $ = cheerio.load(data);
  let products = [];
  // console.log($(itemSelector).length);
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
      console.log(`第${index + 1}个产品未找到 pid`);
    }
    // console.log(`---- hasVideo: ${hasVideo} ----`);
    // console.log(`---- itemLink: ${itemLink} ----`);
    
    obj.hasVideo = hasVideo;
    obj.itemLink = 'http:' + itemLink;
    obj.pid = pid;
    obj.create_at = (new Date()).toLocaleString();
    // console.log(obj);

    products.push(obj);
  })
  products = _.filter(products, 'hasVideo');
  console.log(`本页包含视频的产品实际数量: ` + products.length);
  // console.log(products);
  let toSpide = _.take(products, num);
  // console.log(toSpide);
  toSpide = _.filter(toSpide,function(p){ return p.pid });
  await exportExcel(toSpide.map( (item) => { return [item.pid, item.itemLink] }));
  return toSpide;
}

async function main(listUrl, num) {
  const instance = await initBrowser ();
  const browser = instance.browser;
  const page = instance.page;
  try {
    await Promise.all([
      makeDir('download'),
      makeDir('inputExcels'),
      makeDir('outputExcels'),
    ]);
    const toSpideProducts = await findProductList(page, listUrl, num);
    console.log('待抓取列表：');
    console.log(toSpideProducts);
    const len = toSpideProducts.length;
    let dataList = [];
    for (let i=0; i<len; i++) {
      let product = toSpideProducts[i];
      try {
        let videoUrl = await parseVideoUrlFromPage(page, product.itemLink);
        await downloadVideo (videoUrl, product.pid + '.mp4');
        dataList.push([product.pid, product.itemLink, videoUrl]);
      } catch (error) {
        console.log('error:');
        console.log(error);
        dataList.push([product.pid, product.itemLink, 'error']);
      }
    }
    console.log('任务抓取成功!');
    await exportExcel(dataList, true);
    await browser.close();
    process.exit(0);
  } catch (e) {
    console.log('任务抓取失败!');
    console.log(e.message);
    await browser.close();
    // process.exit(0);
  }
}
// main('https://www.alibaba.com/catalog/food-beverage-machinery_cid100006936?spm=a2700.galleryofferlist.scGlobalHomeHeader.350.fdde4087DsupFI', 5)

function run() {
  const listUrl = yargs['listurl'] || '';
  let num = yargs['num'] || 5;
  num = parseInt(num);
  if(!listUrl) {
    console.log('缺少参数：listurl');
    return;
  }
  if(!num) {
    console.log('num');
    return;
  }
  main(listUrl, num)
}
run();

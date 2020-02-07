const puppeteer = require('puppeteer');
const _ = require('lodash');

async function initBrowser () {
  console.log('开始初始化 puppeteer');
  const browser = await puppeteer.launch({
    headless: false,
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
      "--user-data-dir=/var/tmp/puppeteer/session-alibaba"
    ],
    slowMo: 100, //减速显示，有时会作为模拟人操作特意减速
    devtools: false 
  });
  console.log('初始化 puppeteer 完成');
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

      // console.log(`ABORTING: ${resourceType}`)
      request.abort();
    }
    else
      request.continue();
  })
  console.log('初始化 page 完成');
  return page;
}

// 从详情页中解析信息
async function parseVideoUrlFromPage(url) {
  console.log('打开产品页面: ' + url);
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
    const currency = 'USD';
    console.log('设置价格单位: ' + currency);
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
    // console.log(cookies);
    // 等待页面元素
    await page.waitForSelector('.bc-video-player', { timeout: 6000 }); 
    const videoUrl = await page.$eval('.bc-video-player video', ele => ele.src);
    console.log('找到视频 url: ' + videoUrl);
    const breadcrumbs = await page.$$eval('.detail-breadcrumb .breadcrumb-item .breadcrumb-link span', function(eles){
      return eles.map( item => item.innerText ) 
    }); 
    let name = breadcrumbs[breadcrumbs.length - 1];
    name = _.trim(name);
    // 找产品价格：
    const price = await findPriceFromPage(page);
    await page.close();
    await browser.close();
    return {videoUrl, name, price};
  } catch (error) {
    console.log('未找到视频元素');
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

function getMinPrice(arr) {
  if (!arr.length) {
    return '';
  }
  arr = _.sortBy(arr, function(item) {
    return parseFloat(item.substr(1).replace(/,/g, ""));
  })
  console.log(arr);
  return arr[0];
}
// getMinPrice(['$4,860.00','$4,660.00','$4,460.00']);

// 从详情页中解析产品价格
async function findPriceFromPage(page) {
  try {
    const priceSelectorRules = [
      '.ma-ref-price span',
      '.ma-spec-price span',
      '.ma-reference-price span',
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
          console.log('找到产品 price: ' + minPrice);
          return minPrice;
          break;
        } else {
          continue;
        }
      } catch(e) {
        continue;
      }
    }
    console.log('解析价格失败');
    return '';
  } catch(err) {
    console.log('解析价格失败');
    return '';
  }
}

async function run(url) {
  const videoInfo = await parseVideoUrlFromPage(url);
  console.log('videoInfo：' + JSON.stringify(videoInfo));
}
// run('https://www.alibaba.com/product-detail/Newest-2-2-Seat-Off-Road_62286811640.html'); // 多个价格从大到小
run('https://www.alibaba.com/product-detail/FX2-Wind-Sorter-for-Waste-Plastics_60800496704.html?bypass=true'); // 价格区段
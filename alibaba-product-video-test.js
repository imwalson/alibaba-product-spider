// 测试爬取 alibaba 产品详情页视频
const puppeteer = require('puppeteer');
const fs = require('fs');

const productUrl = 'https://www.alibaba.com/product-detail/7-Barrel-Beer-Brewing-System-for_62236661396.html?spm=a2700.galleryofferlist.normalList.1.7da7326bCC5uI9&s=p';

async function getResourceTree(page) {
  var resource = await page._client.send('Page.getResourceTree');
  return resource.frameTree;
}

const assert = require('assert');
async function getResourceContent(page, url) {
  const { content, base64Encoded } = await page._client.send(
    'Page.getResourceContent',
    { frameId: String(page.mainFrame()._id), url },
  );
  assert.equal(base64Encoded, true);
  return content;
}; 

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
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

  console.log('打开产品页面');
  await page.goto( productUrl, {
    waitUntil: 'domcontentloaded'
  });
  // 等待页面元素
  try {
    await page.waitForSelector('.bc-video-player', { timeout: 5000 }); 
  } catch (error) {
    console.log('未找到视频元素');
  }
  // 获取资源树
  // const frameTree = await getResourceTree(page);
  // console.log(frameTree);
  // 获取资源内容详情
  // const url = 'http://get.ftqq.com/static/image/get32px.png';
  // const content = await getResourceContent(page, url);
  // const contentBuffer = Buffer.from(content, 'base64');
  // fs.writeFileSync('get32px.png', contentBuffer, 'base64');
  console.log('找到视频url: ');
  const videoUrl = await page.$eval('.bc-video-player video', ele => ele.src);
  console.log(videoUrl);
  
  

  await browser.close();
  process.exit(0);
})();

const axios = require('axios');
const cheerio = require('cheerio');
const url = 'https://www.alibaba.com/catalog/food-beverage-machinery_cid100006936?spm=a2700.galleryofferlist.scGlobalHomeHeader.350.fdde4087DsupFI';
const itemSelector = `.m-gallery-product-item-v2`;
const videoMarkSelector = '.seb-img-switcher__icon-video';
const videoMarkSelector2 = '.watermark.has-video';

const headers = {
  "user-agen": 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/72.0.3596.0 Safari/537.36',
  "accept": 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8'
};

async function run() {
  try {
    const resp = await axios.get(url, { headers });
    var data = resp.data;
    var $ = cheerio.load(data);
    var products = [];
    //console.log($('.m-gallery-product-item-v2').html());
    $(itemSelector).each(function(index,element){
      const $element = $(element);
      let obj = {};
      var hasVideo;
      var hasVideo1 = $element.find(videoMarkSelector).first().length;
      var hasVideo2 = $element.find(videoMarkSelector2).first().length;
      if(!hasVideo1 && !hasVideo2) {
        hasVideo = false;
      } else {
        hasVideo = true;
      }
      var itemLink = $element.find('.item-img-inner > a').first().attr('href');  
      var pid = $element.find('.item-img-inner > a').first().attr('data-p4plog'); 
      // console.log(`---- hasVideo: ${hasVideo} ----`);
      // console.log(`---- itemLink: ${itemLink} ----`);
      
      obj.hasVideo = hasVideo;
      obj.itemLink = itemLink;
      obj.pid = pid;
      obj.create_at = (new Date()).getTime();
      obj.crawled = false; // 是否已爬取详情

      products.push(obj);
    })
    console.log(products);
  } catch (error) {
    console.log("script error: " + error.message)
  }
}
// run();

async function searchVideo(url) {
  try {
    const resp = await axios.get(url, { headers });
    var data = resp.data;
    var $ = cheerio.load(data);
    var video = $('video').first();
    if(video.length) {
      var videoUrl = video.attr('src');
      console.log(videoUrl);
    }else {
      console.log('video not found');
    }
  } catch (error) {
    console.log("downloadVideo error: " + error.message)
  }
}
// searchVideo('https://www.alibaba.com/product-detail/7-Barrel-Beer-Brewing-System-for_62236661396.html?spm=a2700.galleryofferlist.normalList.1.7da7326bCC5uI9&s=p')


async function downloadVideo (url,fineName) {  
  const fs = require('fs')  
  const path = require('path')
  const savePath = path.resolve(__dirname, 'download', fineName)
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
downloadVideo ('https://cloud.video.alibaba.com/play/u/2153292369/p/1/e/6/t/1/d/hd/232608997105.mp4','232608997105.mp4');
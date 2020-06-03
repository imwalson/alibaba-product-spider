const fs = require('fs');
const ffprobe = require('ffprobe');
const ffprobeStatic = require('ffprobe-static');
const _ = require('lodash');
var url = require("url");

function sleep(time = 0) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      resolve();
    }, time);
  })
};

function parseProductInfoFromUrl(href) {
  const res = {
    originalId: '',
    productName: '',
  };
  const pagePath = url.parse(href).pathname;
  const arr = pagePath.split('_');
  res.originalId = arr[1] ? arr[1].replace('.html', '') : '';
  res.productName = arr[0] ? arr[0].replace('/product-detail/', '') : '';
  // console.log(res);
  return res;
}

function getVideoSize(link) {
  return new Promise((resolve, reject) => {
    fs.stat(link, function(error,stats){
      if(error){
        reject("file size error");
      } else{
        //文件大小
        // console.log(stats.size);
        resolve(stats.size);
      }
    })
  })
}

function getVideoInfo(filePath) {
  return new Promise((resolve, reject) => {
    ffprobe(filePath, { path: ffprobeStatic.path })
      .then(function (info) {
        // console.log(info);
        const videoObj = _.find(info.streams, { codec_type: 'video' });
        if (videoObj) {
          resolve(videoObj);
        } else {
          reject('no video info');
        }
      })
      .catch(function (err) {
        reject(err);
      })
  })
}

/**
 * 
 * 过滤出有用的视频
 * 1.竖版尺寸：宽高比≤1
 * 2.像素720dpi以上
 * 3.大小2M以上
 */
async function isEffectiveVideo(filePath) {
  try {
    const videoObj = await getVideoInfo(filePath);
    if (videoObj.width >= videoObj.height) {
      console.log('为横版视频');
      return false;
    }
    // if (videoObj.width < 720 && videoObj.height < 720) {
    //   console.log('像素在720dpi以下');
    //   return false;
    // }
    if (videoObj.width < 480 && videoObj.height < 480) {
      console.log('像素在 480dpi 以下');
      return false;
    }
    let videoSize = 0;
    try {
      videoSize = await getVideoSize(filePath);
    } catch (error) {
      console.log('获取视频 size 失败');
      return false;
    }
    if ( videoSize < 2 * 1024 * 1024 ) {
      console.log('视频小于 2M');
      return false;
    }
    return true;
  } catch (error) {
    console.log('get isEffectiveVideo error');
    return false;
  }
}

function getDateString() {
  var str,year,month,day;
  var date = new Date();
  year = date.getFullYear();
  month = date.getMonth() + 1;
  day = date.getDate(); 
  str = year.toString() + '-' + (month>9?month:'0'+month) + '-' + (day>9?day:'0'+day);
  return str;
}

function getDateTimeString() {
  var str,year,month,day,h,m,s;
  var date = new Date();
  year = date.getFullYear();
  month = date.getMonth() + 1;
  day = date.getDate(); 
  h = date.getHours();
  m = date.getMinutes();
  s = date.getSeconds(); 
  str = year.toString() + '-' + (month>9?month:'0'+month) + '-' + (day>9?day:'0'+day) +'_' + (h>9?h:'0'+h) + ':' + (m>9?m:'0'+m) + ':' + (s>9?s:'0'+s);
  return str;
}

function parseAlibabaLinkId(href) {
  const pagePath = url.parse(href).pathname;
  let arr = pagePath.split('/');
  arr = _.reverse(arr);
  const tmpStr = arr[0];
  const arr2 = tmpStr.split('_');
  return arr2[1] || '';
}

// 旧版视频命名规则
function videoNamingRuleV1(productInfo) {
  if (!productInfo.category4 && !productInfo.category3) {
    return `cateLpProd__NONE__NONE__*__${productInfo.originalId}__roi`;
  }
  let categoryStr = productInfo.category4 || productInfo.category3;
  categoryStr = categoryStr.replace(/\//g, ' or ');
  const name = productInfo.originalId + '_' + (categoryStr) + '_' + productInfo[`price_${currency}`] + '.mp4'
  return name;
}

// 新版视频命名规则
// "cateLpProd__", 四级或三级类目ID（最后一级，id 以 url 显示为准）,"__",三级类目名称,"__*__",商品PID,"__roi"
function videoNamingRuleV2(productInfo) {
  if (!productInfo.category4 && !productInfo.category3 && !productInfo.category2) {
    return `cateLpProd__NONE__NONE__*__${productInfo.originalId}__roi.mp4`;
  }
  let lastCatId = productInfo.category4Id || productInfo.category3Id;
  lastCatId = lastCatId.toLocaleLowerCase().replace('pid', '').replace('cid', '');
  const lastCatName = productInfo.category4 || productInfo.category3;
  const name = `cateLpProd__${lastCatId}__${lastCatName}__*__${productInfo.originalId}__roi.mp4`;
  return name;
}

module.exports.sleep = sleep;
module.exports.getVideoSize = getVideoSize;
module.exports.getVideoInfo = getVideoInfo;
module.exports.isEffectiveVideo = isEffectiveVideo;
module.exports.parseProductInfoFromUrl = parseProductInfoFromUrl;
module.exports.getDateString = getDateString;
module.exports.getDateTimeString = getDateTimeString;
module.exports.parseAlibabaLinkId = parseAlibabaLinkId;
module.exports.videoNamingRuleV1 = videoNamingRuleV1;
module.exports.videoNamingRuleV2 = videoNamingRuleV2;

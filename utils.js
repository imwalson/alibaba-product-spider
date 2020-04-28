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

module.exports.sleep = sleep;
module.exports.getVideoSize = getVideoSize;
module.exports.getVideoInfo = getVideoInfo;
module.exports.isEffectiveVideo = isEffectiveVideo;
module.exports.parseProductInfoFromUrl = parseProductInfoFromUrl;

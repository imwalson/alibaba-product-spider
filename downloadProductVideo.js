const path = require('path');
const axios = require('axios');
const fs = require('fs');
const shortid = require('shortid');
const jobId = shortid.generate();
const makeDir = require('make-dir');
const db = require('./db');
const log = require('./logUtils');
log.setSavePath(path.resolve(__dirname, 'logs', jobId + '.log'));
const dbUtils = require('./dbUtils');
const utils = require('./utils');

async function downloadVideo (url) {  
  log.info(`下载视频: ${url}`);
  const name = path.basename(url);
  return new Promise((resolve, reject) => {
    try {
      const timeout = 1 * 60 * 1000; // 1 分钟超时
      // 避免一个文件夹下文件过多，根据文件名分路径
      const str1 = name.substr(0,1);
      const str2 = name.substr(1,1);
      await Promise.all([
        makeDir(`videos/${str1}`),
        makeDir(`videos/${str1}/${str2}`),
      ]);
      const savePath = path.resolve(__dirname, `videos/${str1}/${str2}`, name);
      log.info(`保存路径: ${savePath}`);
      const writer = fs.createWriteStream(savePath);
      axios({
        url,
        method: 'GET',
        responseType: 'stream'
      }).then((response) => {
        response.data.pipe(writer);
        writer.on('finish', () => { resolve(savePath) });
        writer.on('error', reject);
        // 超时时间
        setTimeout(() => {
          reject();
        }, timeout);
      }).catch((error) => {
        log.error('http requst error');
        reject(error);
      })
    } catch (error) {
      log.error('downloadVideo failed');
      log.error(error);
      reject(error);
    }
  })
}

async function run() {
  try {
    const docs = await dbUtils.getUndownloadProduct();
    if (!docs.length) {
      log.info('暂无需要抓取的视频');
      process.exit(0);
      return null;
    }
    // 保存任务到 mongodb
    await dbUtils.saveJobInfo({
      shortId: jobId,
      name: '下载产品视频', // 任务名称
      command: 'node downloadProductVideo.js', // 任务命令
      spideNum: docs.length,
    });
    await makeDir('videos');
    for (let i = 0; i < docs.length; i ++) {
      let product = docs[i];
      let videoUrl = product.videoUrl;
      try {
        // video 查重
        const videoExist = await db.productVideos.findOne({ videoUrl });
        if (videoExist) {
          log.info('视频已在数据库内保存');
          await db.products.update({
            originalId: product.originalId,
          },{ 
            "$set": {
              updateAt: new Date(),
              downloaded: true
            }
          });
        } else {
          let videoPath = await downloadVideo (videoUrl);
          await db.products.update({
            originalId: product.originalId,
          },{ 
            "$set": {
              updateAt: new Date(),
              downloaded: true
            }
          });
          // 获取视频信息
          let videoSize = 0;
          try {
            videoSize = await utils.getVideoSize(videoPath);
          } catch (error) {
            log.error('获取视频 size 失败');
          }
          let videoObj = {};
          try {
            videoObj = await utils.getVideoInfo(videoPath);
          } catch (error) {
            log.error('获取视频宽高失败');
          }
          const videoInfo = {
            videoUrl,
            videoPath,
            videoSize,
            videoWidth: videoObj.width || 0,
            videoHeight: videoObj.height || 0,
          };
          await dbUtils.saveProductVideoInfo(videoInfo);
        }
      } catch (e) {
        log.error('下载保存视频失败');
        log.error(e);
      }
    }
    log.info('任务抓取成功!');
    // await browser.close();
    await dbUtils.endJobSuccess(jobId);
    process.exit(0);
  } catch (error) {
    log.error('任务失败');
    log.error(error.message);
    await dbUtils.endJobWithError(jobId, error.message);
    process.exit(-100);
  }
}

run();
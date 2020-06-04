/**
 * 运行持久化任务2： 按照 excel 表抓取品类视频
 */
/**
 * 抓取品类列表页信息 (持久任务,断点续上)
 * node runSustainedJob2.js --jobId='gYCK2FLa_'
 */
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const _ = require('lodash');
const yargs = require('yargs').argv;
const db = require('./db');
let jobId = ''; // 持久化任务ID
const dbUtils = require('./dbUtils');
const log = require('./logUtils');
log.setSavePath(path.resolve(__dirname, 'logs', jobId + '.log'));
const utils = require('./utils');
const makeDir = require('make-dir');

const count_per_job = 2000;

process.setMaxListeners(Infinity); // Fix "MaxListenersExceededWarning"

process.on("exit",async function(code){
  if (code !== 0) {
    // 更新持久任务状态
    console.log('任务异常退出，更新状态');
    await db.sustainedJobs.update({
      shortId: jobId,
    },{ 
      "$set": {
        updateAt: new Date(),
        status: 4,
        finished: false,
      }
    });
  }
});

async function downloadVideo (url) {
  log.info(`下载视频: ${url}`);
  if (!url) {
    throw new Error('视频 url 不能为空');
  }
  const name = path.basename(url);
  const str1 = name.substr(0,1);
  const str2 = name.substr(1,1);
  await Promise.all([
    makeDir(`videos/${str1}`),
    makeDir(`videos/${str1}/${str2}`),
  ]);
  return new Promise((resolve, reject) => {
    try {
      const timeout = 1 * 60 * 1000; // 1 分钟超时
      // 避免一个文件夹下文件过多，根据文件名分路径
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
        // TODO: 处理 “视频不存在” 错误
      })
    } catch (error) {
      log.error('downloadVideo failed');
      log.error(error);
      reject(error);
    }
  })
}

// 获取
async function getJobProducts(jobInfo) {
  const option = {
    downloaded: { $exists: false },
  };
  if (jobInfo.catLevel) {
    option[jobInfo.catLevel] = jobInfo.catId;
  }
  const docs = await db.high_quality_products.findAsCursor(option)
    .sort({ '_id': 1 })
    .limit(count_per_job)
    .toArray();
  return docs;
}


async function run() {
  // 从数据库获取任务信息
  jobId = yargs['jobId'] || '';
  if(!jobId) {
    log.info('缺少参数： jobId');
    return;
  }
  const jobInfo = await db.sustainedJobs.findOne({ shortId: jobId, type: 2 });
  if (!jobInfo) {
    log.info('未找到持久化任务 ID： ' + jobId);
    process.exit(-100);
  }
  // 查询 Job 状态
  if (jobInfo.finished) {
    log.info('任务已完成，无需重复执行');
    process.exit(-100);
  }
  if (jobInfo.status === 2) {
    log.info('任务正在运行，请勿并发运行');
    process.exit(-100);
  }
  if (jobInfo.status === 3) {
    log.info('任务已成功，无需重复执行');
    process.exit(-100);
  }
  // 开始下载
  const products = await getJobProducts(jobInfo);
  console.log(products.length);
  if (!products.length) {
    log.info('无剩余任务');
    await db.sustainedJobs.update({
      shortId: jobId,
    },{ 
      "$set": {
        updateAt: new Date(),
        finished: true,
        status: 3
      }
    });
    process.exit(-100);
  }
  // 更新持久任务状态
  console.log('持久任务更改状态为进行中');
  await db.sustainedJobs.update({
    shortId: jobId,
  },{ 
    "$set": {
      updateAt: new Date(),
      status: 2
    }
  });
  // 开始下载视频
  const len = products.length;
  log.info(`本次抓取目标数量: ` + len);
  for (let i=0; i<len; i++) {
    let product = products[i];
    // 数据库查重（根据商品 ID 加 价格单位）
    let condition = { originalId: product.product_id };
    let docExist = await db.products.findOne(condition);
    if (docExist) {
      log.info('当前国别商品已抓取，无需重复抓取');
      await db.high_quality_products.update({
        product_id: product.product_id,
      },{ 
        "$set": {
          downloaded: true
        }
      });
    } else {
      log.info('需要新抓取');
      await dbUtils.cacheProductInfo({
        "originalId" : product.product_id,
        "productName" : product.prod_name,
        "hasVideo" : true,
        "videoUrl" : product.video_url,
        "category1" : product.cate_lv1_desc || '',
        "category2" : product.cate_lv2_desc || '',
        "category3" : product.cate_lv3_desc || '',
        "category4" : "",
        "downloaded" : false,
        "createAt" : new Date(),
        "updateAt" : new Date(),
        "jobId" : jobId,
        "category1Id" : product.cate_lv1_id || '',
        "category2Id" : product.cate_lv2_id || '',
        "category3Id" : product.cate_lv3_id || '',
      });
      // 下载视频
      let videoUrl = product.video_url;
      try {
        // video 查重
        const videoExist = await db.productVideos.findOne({ videoUrl });
        if (videoExist) {
          log.info('视频已在数据库内保存');
          await db.products.update({
            originalId: product.product_id,
          },{ 
            "$set": {
              updateAt: new Date(),
              downloaded: true
            }
          });
          await db.high_quality_products.update({
            product_id: product.product_id,
          },{ 
            "$set": {
              downloaded: true
            }
          });
        } else {
          let videoPath = await downloadVideo (videoUrl);
          await db.products.update({
            originalId: product.product_id,
          },{ 
            "$set": {
              videoPath,
              updateAt: new Date(),
              downloaded: true,
            }
          });
          await db.high_quality_products.update({
            product_id: product.product_id,
          },{ 
            "$set": {
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
          log.info(`产品ID ${product.product_id} 的视频保存成功!`);
        }
      } catch (e) {
        log.error('下载保存视频失败');
        log.error(e);
      }
    }
  }

  await db.sustainedJobs.update({
    shortId: jobId,
  },{ 
    "$set": {
      updateAt: new Date(),
      status: 4
    }
  });
  
  log.info('此批次任务抓取成功!');
  process.exit(0);
}

run();

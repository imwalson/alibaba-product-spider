/**
 * 获取有效视频列表
 * node validVideoFilter.js
 */
const fs = require('fs');
const path = require('path');
const makeDir = require('make-dir');
const db = require('./db');
const utils = require('./utils');

const dateString = utils.getDateString();

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
  console.log(`总数量： ${docs.length}`);
  return docs;
}

// async function exportValidVideos({
//   category1,
//   category2,
//   category3,
//   currency,
// }) {
//   let products = await findListProducts(category1, category2, category3, currency);
//   const 
// }

async function filtVideoDocs() {
  const docs = await db.productVideos.findAsCursor({
    videoWidth: { $gte: 480 },
    $where : "this.videoHeight >= this.videoWidth",
    videoSize: { $gte: 2 * 1024 * 1024 },
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
          const outputPath = path.resolve(__dirname, `download/${dateString}`, productInfo.originalId + '_' + productInfo.category3 + '_' + productInfo[price_`${currency}`] + '.mp4');
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
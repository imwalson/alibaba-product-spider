/**
 * 获取有效视频列表
node validVideoFilter2.js --listurl='https://www.alibaba.com/catalog/weight-lifting_cid2008' --currency='GBP' --portrait='1'
 */
const fs = require('fs');
const _ = require('lodash');
const yargs = require('yargs').argv;
const path = require('path');
const db = require('./db');
const utils = require('./utils');
const makeDir = require('make-dir');
const dateString = utils.getDateTimeString();

async function findListProducts({
  listUrl,
  currency,
}) {
  const options = {
    currentUrl: { '$regex': listUrl, '$options': 'i' },
    command: { '$regex': currency, '$options': 'i' },
  };
  const jobDocs = await db.jobs.findAsCursor(options).toArray();
  const jobIds = _.map(jobDocs, "shortId");
  const condition = {
    downloaded: true,
    jobId: { $in: jobIds },
  };
  condition[`price_${currency}`] = { $exists: true };
  const docs = await db.products.findAsCursor(condition)
  .sort({ '_id': 1 })
  .toArray();
  console.log(`待导出总数量： ${docs.length}`);
  return docs;
}

// findListProducts({
//   listUrl: 'https://www.alibaba.com/catalog/pillow_cid40603',
//   currency: 'EGP'
// });

// 过滤有效视频
async function filtVideoDocs(products) {
  const portrait = yargs['portrait'] || false;
  const videoUrls = _.map(products, "videoUrl");
  let option = {
    // videoWidth: { $gte: 480 },
    // $where : "this.videoHeight >= this.videoWidth",
    videoSize: { $gte: 3 * 1024 * 1024 },
    videoUrl: { $in: videoUrls }
  };
  if (portrait) {
    option = {
      ...option,
      ...{
        $where : "this.videoHeight > this.videoWidth",
      }
    }
  }
  const docs = await db.productVideos.findAsCursor(option)
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
          const outputPath = path.resolve(__dirname, `download/${dateString}`, productInfo.originalId + '_' + (productInfo.category4 || productInfo.category3) + '_' + productInfo[`price_${currency}`] + '.mp4');
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
async function exportValidVideos() {
  const listUrl = yargs['listurl'] || '';
  const currency = yargs['currency'] || '';
  if(!listUrl) {
    console.log('缺少参数： listurl');
    return;
  }
  if(!currency) {
    console.log('缺少参数： currency');
    return;
  }
  try {
    const productDocs = await findListProducts({
      listUrl,
      currency,
    })
    if (!productDocs.length) {
      console.log('products 不存在');
      process.exit(0);
    }
    await Promise.all([
      makeDir('download'),
      makeDir(`download/${dateString}`),
    ]);
    const videoDocs = await filtVideoDocs(productDocs);
    for (let i = 0; i < productDocs.length; i ++) {
      let productInfo = productDocs[i];
      await makeDir(`download/${dateString}/${productInfo.category4 || productInfo.category3}_${currency}`);
      let videoName = productInfo.originalId + '_' + (productInfo.category4 || productInfo.category3) + '_' + productInfo[`price_${currency}`] + '.mp4';
      let outputPath = path.resolve(__dirname, `download/${dateString}/${productInfo.category4 || productInfo.category3}_${currency}`, videoName);
      // 历史排重
      const saved = await db.validVideos.findOne({ videoName });
      if (saved) {
        console.log('重复视频，无需重复筛选');
      } else {
        console.log('找到新视频');
        // 是否存在视频文件
        const videoDoc = _.find(videoDocs, { videoUrl: productInfo.videoUrl });
        if (!videoDoc) {
          console.log('视频未下载或不符合条件');
          // console.log(productInfo);
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
            category4: productInfo.category4,
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


exportValidVideos();
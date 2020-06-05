/**
 * 获取有效视频列表(excel 精品视频 excel 表)
node validExcelVideoFilter.js --jobId='gYCK2FLa_' --portrait='1'
 */
const fs = require('fs');
const _ = require('lodash');
const yargs = require('yargs').argv;
const path = require('path');
const db = require('./db');
const utils = require('./utils');
const makeDir = require('make-dir');
const dateString = utils.getDateTimeString();

const count_per_page = 1000; // 每批导出 1000 个视频

async function findListProductCount(jobId) {
  const options = {
    jobId,
    downloaded: true
  };
  const count = await db.products.count(options);
  console.log(`待导出总数量： ${count}`);
  return count;
}

// findListProductCount('gYCK2FLa_');


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

// 主函数
async function exportValidVideos() {
  const jobId = yargs['jobId'] || '';
  if(!jobId) {
    console.log('缺少参数： listurl');
    return;
  }
  try {
    const productCount = await findListProductCount(jobId);
    if (!productCount) {
      console.log('products 不存在');
      process.exit(0);
    }
    const pageNum = Math.ceil(productCount / count_per_page);
    console.log(`总共${productCount}个视频分${pageNum}批导出,每批${count_per_page}个视频`);
    await Promise.all([
      makeDir('download'),
      makeDir(`download/${dateString}`),
    ]);
    // 分批次抓取
    const options = {
      jobId,
      downloaded: true
    };
    for (let n = 0; n < pageNum; n ++) {
      const productDocs = await db.products.findAsCursor(options)
        .sort({ '_id': 1 })
        .limit(count_per_page)
        .skip(n * count_per_page)
        .toArray();
      console.log(`开始导出第 ${n + 1} 批 ${productDocs.length} 个视频`);
      const videoDocs = await filtVideoDocs(productDocs);
      for (let i = 0; i < productDocs.length; i ++) {
        let productInfo = productDocs[i];
        let categoryStr = productInfo.category4 || productInfo.category3;
        categoryStr = categoryStr.replace(/\//g, ' or ');
        await makeDir(`download/${dateString}/${categoryStr}`);
        let videoName = utils.videoNamingRuleV2(productInfo);
        let outputPath = path.resolve(__dirname, `download/${dateString}/${categoryStr}`, videoName);
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
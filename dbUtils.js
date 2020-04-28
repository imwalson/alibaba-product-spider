const shortid = require('shortid');
const db = require('./db');

// 保存任务
async function saveJobInfo(options) {
  console.log('创建任务信息到数据库');
  const doc = {
    ...options,
    ...{
      status: 2,
      finished: false,
      createAt: new Date(),
      updateAt: new Date(),
      errorCount: 0,
    },
  };
  const res = await db.jobs.insert(doc);
  console.log('创建成功');
  return res;
}

// 任务错误
async function endJobWithError(shortId, errorInfo) {
  console.log('保存任务错误信息到数据库');
  const doc = await db.jobs.findOne({ shortId });
  if (doc) {
    await db.jobs.update({
      shortId: shortId,
    },{ 
      "$set": {
        status: 4,
        finished: false,
        updateAt: new Date(),
        errorInfo: errorInfo
      },
      "$inc": {
        errorCount: 1
      }
    });
    console.log('保存成功');
    return true;
  } else {
    return null;
  }
}

// 任务成功
async function endJobSuccess(shortId, successInfo = {}) {
  console.log('保存任务成功信息到数据库');
  const doc = await db.jobs.findOne({ shortId });
  if (doc) {
    await db.jobs.update({
      shortId: shortId,
    },{ 
      "$set": {
        status: 3,
        finished: true,
        updateAt: new Date(),
        successInfo
      }
    });
    console.log('保存成功');
    return true;
  } else {
    return null;
  }
}

// 更新任务当前抓取列表
async function updateJobListUrl(shortId, url) {
  console.log('更新任务当前抓取列表');
  const doc = await db.jobs.findOne({ shortId });
  if (doc) {
    await db.jobs.update({
      shortId: shortId,
    },{ 
      "$set": {
        currentUrl: url,
        updateAt: new Date()
      }
    });
    console.log('更新成功');
    return true;
  } else {
    return null;
  }
}

// 根据原ID获取数据库数据
async function findProductByPid(pid) {
  const doc = await db.products.findOne({ originalId: pid });
  return doc;
}
// 缓存产品信息
async function cacheProductInfo(info) {
  console.log('保存产品信息到数据库');
  // console.log(info);
  try {
    const doc = await db.products.findOne({ originalId: info.originalId });
    if (doc) {
      // 更新价格
      await db.products.update({
        originalId: info.originalId,
      },{ 
        "$set": {
          ...info,
          ... { updateAt: new Date() }
        }
      });
    } else {
      await db.products.insert({
        ...info,
        ...{
          downloaded: false,
          createAt: new Date(),
          updateAt: new Date(),
        }
      });
    }
    console.log('保存成功');
    return info;
  } catch (error) {
    console.log('保存错误');
    throw error;
  }
}

// 获取 100 个视频未下载的产品
async function getUndownloadProduct() {
  const docs = await db.products.findAsCursor( {
    downloaded: false,
  })
  .sort({ '_id': 1 })
  .limit(100)
  .toArray();
  return docs;
}

// 保存产品视频元数据
async function saveProductVideoInfo(info) {
  try {
    const doc = await db.productVideos.findOne({ videoUrl: info.videoUrl });
    if (doc) {
      console.log('视频已在数据库内保存');
    } else {
      await db.productVideos.insert({
        ...info,
        ...{
          createAt: new Date(),
          updateAt: new Date(),
        }
      });
    }
    console.log('保存成功');
    return info;
  } catch (error) {
    console.log('保存错误');
    throw error;
  }
}


module.exports = {
  saveJobInfo,
  endJobWithError,
  endJobSuccess,
  updateJobListUrl,
  findProductByPid,
  cacheProductInfo,
  getUndownloadProduct,
  saveProductVideoInfo,
};
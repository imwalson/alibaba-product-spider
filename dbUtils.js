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

// 缓存产品信息
function catchProductInfo(info) {
  // 查重
  // 重复且存在新国别的 price，则保存 price
  // 不重复，直接新增
  const prices = {};
  const doc = {
    originalId: info.originalId || '',
    hasVideo: false,
    prices,
  };
  return db.products.insert(doc);
}


module.exports = {
  saveJobInfo,
  endJobWithError,
  endJobSuccess,
  catchProductInfo
};
/**
 * 创建持久化任务
 */
const shortid = require('shortid');
const db = require('./db');
const jobId = shortid.generate();

async function createSustainedJob(options) {
  try {
    const doc = await db.sustainedJobs.insert(options);
    console.log(`任务创建成功：`);
    console.log(doc);
    process.exit(0);
  } catch (error) {
    console.log('createSustainedJob error');
    console.log(error);
    process.exit(-100);
  }
}

// 创建列表页抓取任务
createSustainedJob({
  shortId: jobId, // 任务短ID
  type: 1, // 任务类型: 1.抓取列表信息
  name: '抓取 Outdoor Lighting 商品信息，国家 SAR', // 任务名称
  listUrl: 'https://www.alibaba.com/catalog/outdoor-lighting_cid100009165', // 列表页面
  num: 1000, // 抓取数量
  currency: 'SAR', // 国别
  createAt: new Date(), // 创建时间
  updateAt: new Date(), // 最后更新时间
  currentUrl: 'https://www.alibaba.com/catalog/outdoor-lighting_cid100009165', // 抓取到了哪个列表页 url，方便继续执行
  finished: false, // 任务是否完成
  status: 1, // 任务状态: 1.已创建未开始 2.运行中 3.运行成功 4.运行失败
})


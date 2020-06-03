/**
 * 运行持久化任务2： 按照 excel 表抓取品类视频
 */
/**
 * 抓取品类列表页信息 (持久任务,断点续上)
 * node runSustainedJob2.js --jobId='jhI7pWxRJ'
 */
const path = require('path');
const _ = require('lodash');
const yargs = require('yargs').argv;
const db = require('./db');
let jobId = ''; // 持久化任务ID
const dbUtils = require('./dbUtils');
const log = require('./logUtils');
log.setSavePath(path.resolve(__dirname, 'logs', jobId + '.log'));
const utils = require('./utils');

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

async function getJobProducts() {

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
  currency = jobInfo.currency;

  // 保存单次任务到 mongodb
  await dbUtils.saveJobInfo({
    shortId: jobId,
    name: `持久化任务：抓取列表商品信息。抓取数量${num}，列表页：${listUrl}，国别：${currency}`, // 任务名称
    command: `node listInfoSpider.js --listurl='${listUrl}' --num=${num}  --currency='${currency}'`, // 任务命令
    spideNum: num,
  });
  log.info(`产品抓取目标数量: ` + num);
  
}

run();

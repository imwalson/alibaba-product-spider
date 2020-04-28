/**
 * 保存抓取历史的数据库表结构
 */

// 任务信息表
var jobSchema = {
  shortId: String, // 任务唯一短ID
  name: String, // 任务名称
  command: String, // 任务命令
  spideNum: Number, // 抓取数量
  status: Number, // 任务状态: 1.等待中 2.进行中 3.成功 4.失败
  finished: Boolean, // 任务是否完成
  createAt: Date, // 创建时间
  updateAt: Date, // 最后更新时间
  errorCount: Number, // 失败次数 （失败超过几次后不再执行，并发邮件提醒）
  errorInfo: String, // 错误信息
  successInfo: Object, // 任务成功后额外信息
  currentUrl: String, // 抓取到了哪个列表页 url，方便继续执行
};

// 用来缓存阿里巴巴产品信息表
var productSchema = {
  originalId: String, // 原始 ID
  hasVideo: Boolean, // 是否存在视频
  prices: { // 不同国家单位的价格
    INR: String,
    USD: String,
  },
  productName: String, // 产品名称
  productImage: String, // 产品图片 url
  category1: String, // 一级类目名称
  category2: String, // 二级类目名称
  category3: String, // 三级类目名称
  videoUrl: String, // 视频文件 url
  downloaded: Boolean, // 视频是否已下载
  videoPath: String, // 视频文件保存路径
  videoSize: Number, // 视频文件大小
  videoWidth: Number, // 视频文件宽
  videoHeight: Number, // 视频文件高
  createAt: Date, // 创建日期
  updateAt: Date, // 修改日期
};

// job 对应的产品列表
var jobProductSchema = {
  jobId: String, // 任务唯一短ID
  productId: String, // 原始产品 ID
  listUrl: String, // 所在列表页 url
  valid: Boolean, // 视频是否有用
  videoUrl: String, // 视频文件 url
  downloaded: Boolean, // 视频是否已下载
  videoPath: String, // 视频文件保存后的路径
};

需求一：给定 excel 文档，逐行解析产品信息并导出到新excel
1.存放输入文件到 inputExcels 文件夹，如 input-1.xlsx
2.运行命令：(input-1.xlsx 替换为实际文件名)
  node index.js --path='./inputExcels/input-1.xlsx' 
3.脚本运行完毕会输出文件名，去 outputExcels 文件夹中寻找对应文件

建议： 输入的 excel 文件不应该过大，如果过大(超过 300 行)，请分多次抓取

需求二：提供产品列表页 url 和产品数量，抓取包含视频的产品内的视频
1.运行命令：
node video-spider.js --listurl='https://www.alibaba.com/catalog/food-beverage-machinery_cid100006936?spm=a2700.galleryofferlist.scGlobalHomeHeader.350.fdde4087DsupFI' --num=5  --currency='INR'
2.脚本运行完毕会输出文件，pid 列表在 outputExcels 文件夹中；视频文件在 download 文件夹中

需求三：输入产品 pid 的 excel 文档，输出 pid、product name 文档，并保存视频文件
1.存放输入文件到 inputExcels 文件夹，如 pids1.xlsx
2.运行命令：(pids1.xlsx 替换为实际文件名)
  node indexV3.js --path='./inputExcels/pids1.xlsx' --currency='INR'

需求四：提供产品分类列表页 url 和产品数量，抓取包含视频的产品内的视频，包含过滤条件
1.运行命令：
node indexV4.js --listurl='https://www.alibaba.com/catalog/dinnerware_cid100004988?spm=a272h.12677575.channel_image_category.4.ccdc60c6QS3fRu' --num=5  --currency='INR'
2.脚本运行完毕会输出文件，pid 列表在 outputExcels 文件夹中；视频文件在 download 文件夹中



脚本五： 提供产品列表页 url 和产品数量、国别，抓取包含视频的产品信息到数据库内（不下载视频）
node listInfoSpider.js --listurl='https://www.alibaba.com/catalog/dinnerware_cid100004988?spm=a272h.12677575.channel_image_category.4.ccdc60c6QS3fRu' --num=5  --currency='INR'


脚本六： 下载数据库内未下载的产品视频
node downloadProductVideo.js
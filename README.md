# 食饮成本监控终端（fb-cost-monitor）

这是一个食品饮料行业原材料成本监控网站，主要看原材料价格、周度异动、下游公司传导、公司 K 线和成本敏感度。新闻已经单独做成自动更新，只保留和原材料价格、供需、产量、进口、天气或政策等有直接关系的内容。

技术上使用 React + Vite 做网页，Python 做数据采集和筛选，GitHub Actions 自动运行，GitHub Pages 负责发布网站。

## 更新频率先说清楚

- 行情、K 线和成本数据：每个交易日北京时间 16:30 更新一次。
- 原材料新闻：GitHub Actions 每 30 分钟检查一次。
- 已打开的网页：每 5 分钟读取一次最新的新闻文件，不用手动刷新页面。
- 如果这一轮没有新的相关新闻，就不会创建空提交；定时任务仍会校验并重新发布当前版，上一次部署失败时也能自动补发。
- 如果某个新闻源暂时访问失败，网站继续使用上一版新闻，不会变成空白。

这里的“实时更新”是接近实时，不是几秒钟一次。原因很简单：GitHub Pages 只能放静态网页，不能在服务器上一直运行抓新闻程序；GitHub Actions 的定时任务也可能排队，所以正常情况下新闻会有几十分钟延迟。以后放到老师自己的服务器后，可以把同一套脚本改成服务器定时任务，更新频率也可以再提高。

## 第一次放到 GitHub Pages

1. 把完整项目推送到 GitHub 仓库。
2. 打开仓库的 `Settings → Pages`，在 `Build and deployment` 中把 Source 选成 `GitHub Actions`。
3. 打开 `Settings → Actions → General`，在 `Workflow permissions` 中选 `Read and write permissions`。自动更新后需要把新数据写回仓库，所以这一步不能漏。
4. 进入 `Actions`，手动运行一次“数据更新与站点部署”。第一次会采集全年行情，通常比平时慢。
5. 再手动运行一次“原材料新闻更新与站点部署”，确认新闻抓取和筛选正常。
6. 发布完成后访问 `https://你的用户名.github.io/fb-cost-monitor/`。

以后不需要每天手动操作：行情走每日流程，新闻走每 30 分钟流程。两套流程共用同一个排队锁，不会同时改数据造成冲突。

## 新闻是怎么筛的

新闻必须同时满足两个条件才会进入网站：

1. 明确提到网站监控的 34 项原材料之一，例如白糖、棕榈油、玉米、豆粕、生猪、原奶、乳清蛋白、PET 瓶片、坚果、鱼油或维生素等。
2. 内容确实涉及价格、成本、供需、产量、库存、进出口、天气、捕捞、养殖或政策影响。

只讲食品饮料板块涨跌、公司财报、股票回购、食谱、健康功效，或者只是碰巧出现同名词的新闻，不会显示。新闻和原材料的对应关系由采集端写好，网页不再自己猜。

## 老师压缩包的安全提醒

老师发来的 `qq-monitor` 压缩包不要原样上传到 GitHub，其中有服务器、QQ 和访问凭证类配置。本项目只重写了其中的公开新闻抓取思路，没有复制 QQ 推送、管理员配置或任何密钥。原压缩包里已经出现过的密钥和管理凭证，建议由老师在服务端废止后重新生成。

## 平时怎么手动更新

不改代码也能手动更新：

- 只更新新闻：`Actions → 原材料新闻更新与站点部署 → Run workflow`
- 更新行情和全部数据：`Actions → 数据更新与站点部署 → Run workflow`

在本机检查时可以运行：

```bash
python3 pipeline/test_news_filter.py
python3 pipeline/collect_news.py
python3 pipeline/build_data.py
npm ci
npm run build
```

`npm run build` 成功后生成的 `dist` 文件夹，可以直接放到 Nginx 网站目录。直接复制 `dist` 只能发布当时的数据；想让老师服务器上的网站继续自动更新，还需要在服务器上保留完整源码和 Python 环境，并用定时任务运行采集、构建和发布流程。

## 目录里分别是什么

```text
pipeline/
  collect_daily.py       每日采集原材料行情和公司 K 线
  collect_news.py        抓取公开新闻源并合并到新闻归档
  news_filter.py         原材料相关新闻筛选、规范化和去重
  test_news_filter.py    新闻筛选规则测试
  news_config.json       34 项原材料关键词、排除词和更新频率
  build_data.py          聚合行情、计算异动并生成网站主数据
  ingest_inbox.py        验收并合并成员交付的数据
  validate_ingest.py     单独检查成员交付的 Excel
  config.json            品种、下游映射、敏感度和数据源配置
  news_archive.json      通过筛选的新闻归档
public/data/
  app_data.json          网站主数据
  news.json              网页每 5 分钟读取的新闻文件
  kline.json             公司 K 线
  run_log.json           最近一次行情采集日志
src/                     React 前端源码
.github/workflows/       行情和新闻两套自动更新流程
```

## 成员人工采集

成员 Excel 的模板和填写规则见 `delivery/数据交付规范_v1.md`。需要单独检查文件时运行：

```bash
python3 pipeline/validate_ingest.py 采集_成员X_YYYYMMDD.xlsx --merge
```

放进 `pipeline/inbox` 的文件也会在每日更新时自动验收和合并。

## 常见问题

### 新闻一直没变

先去 `Actions` 看“原材料新闻更新与站点部署”最近一次是否成功。没有符合筛选条件的新闻时，文件本来就不会变化；如果采集源临时失败，流程会保留上一版。也可以手动运行一次，点进失败步骤看具体提示。

### Actions 提示没有权限推送

到 `Settings → Actions → General → Workflow permissions`，确认已经选择 `Read and write permissions`。如果组织账号有统一限制，需要让仓库管理员开放。

### Actions 成功了，但网页还是旧的

先看 `Settings → Pages` 的 Source 是否为 `GitHub Actions`，再等几分钟让 Pages 发布完成。网页新闻每 5 分钟检查一次；仍未变化时可以强制刷新浏览器。

### 新闻采集失败会不会把网站弄空

不会。工作流发现采集失败后会恢复仓库中上一版 `news.json` 和新闻归档；校验不通过也不会提交或部署。

### 怎么确认数据没混进无关内容

每次自动更新都会先运行筛选测试，再检查新闻是否有有效链接、发布时间、原材料编号和命中关键词，同时检查重复内容。任一检查失败，更新就会停止，旧网站继续可用。

## 数据口径

- 现货价为生意社现货评估价（日频），周度聚合取最后交易日。
- 异动规则 1：连续至少 3 周同向涨跌；规则 2：本周绝对涨跌幅大于前 4 周平均绝对波动；两条都满足为重大异动，只满足一条为普通异动。
- K 线为新浪前复权日线，A 股使用红涨绿跌。
- 成本占营收比目前是分析师假设口径，后续可以再用年报数据校准。

# 食饮成本监控终端（fb-cost-monitor）

食品饮料行业原材料成本监控独立站：周度价格异动预警 → 下游上市公司传导 → K线联动 → 成本敏感度压力测试。

**技术栈**：React 19 + Vite 7 + Tailwind + echarts（前端）｜ Python + akshare（数据管线）｜ GitHub Actions 每日自动更新 + Pages 托管

## 快速部署（5分钟）

1. **Fork/推送本仓库** 到你的 GitHub 账号
2. **开启 Pages**：Settings → Pages → Build and deployment → Source 选 **GitHub Actions**
3. **开启 Actions 写权限**：Settings → Actions → General → Workflow permissions → 选 **Read and write permissions**（数据bot回传需要）
4. **手动首跑**：Actions → 「数据更新与站点部署」→ Run workflow
   - 首跑约8-10分钟：自动自举全年K线（159只）+现货历史（15品种×26周）→ 构建 → 部署
5. 访问 `https://<你的用户名>.github.io/fb-cost-monitor/`

之后**每交易日16:30(CST)自动**采集→聚合并检测异动→重建数据→重新部署，无需人工干预。

## 目录结构

```
pipeline/               数据管线（Python）
  collect_daily.py      每日采集：生意社现货15品种 + A/H股K线159只（增量，缺文件自动自举）
  build_data.py         周度聚合 + SPEC异动规则 + 生成 public/data/app_data.json
  validate_ingest.py    成员采集Excel验收/合并（配合《数据交付规范》）
  config.json           静态配置：品种字典/下游映射/敏感度/阈值/数据源/测试日志（口径单一事实源）
  news_archive.json     资讯归档（追加写）
public/data/            运行时数据（管线每日重建，前端相对路径加载）
  app_data.json         主数据（品种/公司/异动/资讯/阈值/口径）
  kline.json            159只K线（懒加载）
  run_log.json          最近采集日志
src/                    React 前端（6页面：驾驶舱/原材料/K线/敏感度/阈值/数据源）
```

## 口径约定（与数据库 dim_caliber 一致）

- 现货价=生意社现货评估价（日频）；周=ISO-8601；周聚合取最后交易日
- 异动规则1：连续≥3周同向涨跌；规则2：|周涨跌|>前4周均绝对波动；重大=1且2，普通=1或2
- K线=新浪前复权日线；A股红涨绿跌
- 成本占营收比=分析师假设v1（待年报校准，页面有口径声明）

## 成员人工采集

两位成员的Excel模板与验收流程见 `/delivery/数据交付规范_v1.md`；
验收：`python3 pipeline/validate_ingest.py 采集_成员X_YYYYMMDD.xlsx --merge`

## 本地开发

```bash
npm ci && npm run dev        # 前端
python3 pipeline/collect_daily.py && python3 pipeline/build_data.py   # 数据
```

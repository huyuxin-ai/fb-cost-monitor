import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  isConnected,
  absvol,
  evalAnomaly,
  fmtPct,
  fmtPrice,
  pctClass,
  streakText,
  IMPORT_DEPENDENT,
  NEWS_KEYWORD_MAP,
  type Derived,
  type Material,
  type NewsExt,
  type NewsItem,
} from '@/lib/data'
import { useAppData } from '@/lib/appData'
import { useWatchlist } from '@/lib/watchlist'
import { useThresholds } from '@/lib/config'
import {
  Panel,
  AnomalyBadge,
  ExpBadge,
  CompanyLink,
  Empty,
} from '@/components/terminal'

/* ============ KPI ============ */
function KpiStrip() {
  const { DATA, MATERIALS, COMPANIES, majorAnomalies, normalAnomalies } = useAppData()
  const connected = MATERIALS.filter(isConnected).length
  const kpis = [
    {
      label: '监控品种数',
      value: `${connected}`,
      sub: `/ 全口径 ${MATERIALS.length}`,
      tone: 'text-[#e8eef5]',
    },
    {
      label: '本周重大异动',
      value: `${majorAnomalies.length}`,
      sub: majorAnomalies.map((m) => m.name).join('、') || '无',
      tone: 'text-amber',
    },
    {
      label: '本周普通异动',
      value: `${normalAnomalies.length}`,
      sub: '详见下方卡片区',
      tone: 'text-[#e8eef5]',
    },
    {
      label: '覆盖公司数',
      value: `${COMPANIES.length}`,
      sub: `A股 ${COMPANIES.filter((c) => c.market === 'A').length} / 港股 ${COMPANIES.filter((c) => c.market === 'HK').length}`,
      tone: 'text-[#e8eef5]',
    },
    {
      label: '数据周',
      value: DATA.data_week,
      sub: '截至 2026-08-28',
      tone: 'text-amber',
    },
  ]
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
      {kpis.map((k) => (
        <div key={k.label} className="panel px-3 py-2">
          <div className="text-[11px] text-[#8b98a9]">{k.label}</div>
          <div className={`num mt-0.5 text-[22px] font-bold leading-none ${k.tone}`}>
            {k.value}
            <span className="ml-1 text-[11px] font-normal text-[#7d8a9b]">{k.sub}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

/* ============ 周报导出 ============ */
function buildWeeklyReport(D: Derived): string {
  const { DATA, MATERIALS, NEWS_EXT, anomalousMaterials, majorAnomalies, normalAnomalies } = D
  const lines: string[] = []
  lines.push(`# 食品饮料原材料成本监控 · 异动周报（${DATA.data_week}）`)
  lines.push('')
  lines.push(`> 数据生成：${DATA.generated_at} ｜ 现货口径：生意社评估价（与期货存在基差）｜ A股口径红涨绿跌`)
  lines.push('')
  lines.push(`## 一、本周异动概览`)
  lines.push('')
  lines.push(`- 监控品种：已接入 ${MATERIALS.filter(isConnected).length} / 全口径 ${MATERIALS.length}`)
  lines.push(`- 重大异动 ${majorAnomalies.length} 个；普通异动 ${normalAnomalies.length} 个`)
  lines.push('')
  const sorted = [...anomalousMaterials].sort((a, b) =>
    a.latest!.anomaly === b.latest!.anomaly ? 0 : a.latest!.anomaly === '重大异动' ? -1 : 1,
  )
  for (const m of sorted) {
    const l = m.latest!
    lines.push(`## 二、${m.name}（${m.id}）【${l.anomaly}】`)
    lines.push('')
    lines.push(
      `- 最新价 ${fmtPrice(l.price)} ${m.unit}（${l.date}），周环比 ${fmtPct(l.wow)}，${streakText(l.streak)}`,
    )
    lines.push(`- 类别：${m.category} ｜ 数据源：${m.source}（${m.freq}）`)
    if (IMPORT_DEPENDENT.has(m.id)) lines.push(`- 标签：进口依赖·汇率敏感`)
    lines.push(`- 下游影响：`)
    for (const d of m.downstream ?? []) {
      lines.push(`  - [${d.level}] ${d.name}（${d.code}）— ${d.note}`)
    }
    lines.push('')
  }
  lines.push(`## 三、相关资讯摘要（与异动品种相关前置）`)
  lines.push('')
  for (const n of NEWS_EXT.filter((x) => x.hot).slice(0, 10)) {
    lines.push(`- ${n.date} 【${n.type}】${n.title}（${n.company} / ${n.source}）`)
  }
  lines.push('')
  lines.push(`---`)
  lines.push(`*成本占营收比为分析师经验假设 v1（待年报校准）；缺失数据见测试日志。*`)
  return lines.join('\n')
}

function downloadWeeklyReport(D: Derived) {
  const md = buildWeeklyReport(D)
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `异动周报_${D.DATA.data_week}.md`
  a.click()
  URL.revokeObjectURL(url)
}

/* ============ 异动预警卡片 ============ */
function AnomalyCard({ m }: { m: Material }) {
  const navigate = useNavigate()
  const { config } = useThresholds()
  const l = m.latest!
  const ev = evalAnomaly(m, config.anomaly)
  const v4 = absvol(m, 4)
  const major = l.anomaly === '重大异动'
  const rules: string[] = []
  if (Math.abs(l.streak) >= config.anomaly.streakWeeks)
    rules.push(`规则1 连续${Math.abs(l.streak)}周同向(≥${config.anomaly.streakWeeks}周)`)
  if (v4 != null && l.wow != null && Math.abs(l.wow) >= v4 * config.anomaly.volMultiplier)
    rules.push(
      `规则2 周波动${Math.abs(l.wow).toFixed(2)}% ≥ 前${config.anomaly.volWindow}周均值${v4.toFixed(2)}%`,
    )
  if (!rules.length) rules.push('数据预计算口径触发（详见阈值配置页重算）')

  return (
    <div
      className={`panel flex flex-col ${major ? 'border-[#f0b90b]/60 shadow-[0_0_12px_rgba(240,185,11,0.12)]' : ''}`}
    >
      <div className="flex items-start justify-between gap-2 border-b border-[#232b36] px-2.5 py-1.5">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-[14px] font-bold text-[#e8eef5]">{m.name}</span>
            <span className="tag">{m.category}</span>
            {IMPORT_DEPENDENT.has(m.id) && <span className="tag-import">进口依赖·汇率敏感</span>}
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-[#5c6875]">
            {m.id} · {m.source}
          </div>
        </div>
        <AnomalyBadge level={l.anomaly} />
      </div>
      <div className="flex items-end gap-3 px-2.5 py-2">
        <div>
          <div className="num text-[20px] font-bold leading-none text-[#e8eef5]">
            {fmtPrice(l.price)}
            <span className="ml-1 text-[10px] font-normal text-[#7d8a9b]">{m.unit}</span>
          </div>
          <div className="mt-1 flex items-center gap-2 font-mono text-[11px]">
            <span className={pctClass(l.wow)}>{fmtPct(l.wow)}</span>
            <span className="text-[#8b98a9]">{streakText(l.streak)}</span>
          </div>
        </div>
        <div className="ml-auto text-right text-[10px] leading-relaxed text-[#7d8a9b]">
          <div>{l.week} · 截至{l.date}</div>
          {ev.refVol != null && (
            <div>
              前{config.anomaly.volWindow}周均波动 <span className="num">{ev.refVol.toFixed(2)}%</span>
            </div>
          )}
        </div>
      </div>
      <div className="border-t border-[#1c242f] px-2.5 py-1.5 text-[11px] text-[#8b98a9]">
        <span className="text-[#5c6875]">触发规则：</span>
        {rules.map((r) => (
          <span key={r} className="mr-2 inline-block">
            <span className="text-amber">▸</span> {r}
          </span>
        ))}
      </div>
      {/* 下游影响 */}
      <div className="flex-1 border-t border-[#1c242f] px-2.5 py-1.5">
        <div className="mb-1 text-[11px] font-semibold text-[#8b98a9]">
          下游影响（{m.downstream?.length ?? 0} 家，点击公司看K线）
        </div>
        <div className="flex flex-wrap gap-1">
          {(m.downstream ?? []).map((d) => (
            <button
              key={d.code}
              onClick={() => navigate(`/kline?code=${encodeURIComponent(d.code)}`)}
              title={`${d.note}`}
              className="group flex items-center gap-1 rounded-sm border border-[#2a3442] bg-[#131922] px-1.5 py-0.5 text-[11px] hover:border-[#f0b90b]/60"
            >
              <ExpBadge level={d.level} />
              <span className="text-[#d6dee8] group-hover:text-[#f0b90b]">{d.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ============ 公告风险雷达 ============ */
function RiskRadar() {
  const { DATA, scanAnnouncementRisk } = useAppData()
  const { config } = useThresholds()
  const { hits, scanned, windowStart } = scanAnnouncementRisk(config.announcement)
  const newsNav = useNewsNav()
  return (
    <Panel
      title="公告风险雷达"
      source={`资讯·新华财经 · 更新 2026-08-21 · 窗口 ${windowStart}~${DATA.generated_at}`}
      extra={
        <span className="font-mono text-[10px] text-[#7d8a9b]">
          扫描 {scanned} 条 / 命中 {hits.length}
        </span>
      }
    >
      {hits.length === 0 ? (
        <div className="py-2">
          <Empty text={`扫描窗口内（${config.announcement.scanWindowDays}天）无命中风险关键词的公告/资讯`} />
          <div className="px-1 pb-1 text-[10px] text-[#5c6875]">
            高风险词：[{config.announcement.keywordsHigh.join(' / ')}]（≥{config.announcement.scoreHigh}分）；
            中风险词：[{config.announcement.keywordsMid.join(' / ')}]（≥{config.announcement.scoreMid}分）。
            关键词与分值阈值可在「阈值配置」页调整。
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          {hits.map((h, i) => {
            const nav = newsNav(h.news)
            return (
              <div
                key={i}
                onClick={nav?.go}
                title={nav ? nav.hint : undefined}
                className={`rounded-sm border px-2 py-1.5 ${
                  h.level === '高'
                    ? 'border-[#f23645]/70 bg-[#f23645]/5'
                    : 'border-[#f0b90b]/60 bg-[#f0b90b]/5'
                } ${nav ? 'cursor-pointer transition-colors hover:bg-[#1a2230]' : ''}`}
              >
              <div className="flex items-center gap-2">
                <span
                  className={`num rounded-sm px-1 text-[11px] font-bold ${
                    h.level === '高' ? 'bg-[#f23645] text-white' : 'bg-[#f0b90b] text-[#1a1305]'
                  }`}
                >
                  {h.score}
                </span>
                <span className="text-[10px] text-[#7d8a9b]">{h.news.date}</span>
                <span className="tag">{h.news.type}</span>
                <span className="text-[11px] text-[#8b98a9]">{h.news.company}</span>
              </div>
              <div className="mt-0.5 text-[12px] text-[#d6dee8]">
                {h.news.title}
                {nav && <span className="ml-1 text-[10px] text-[#f0b90b]">↗</span>}
              </div>
              <div className="mt-0.5 text-[10px]">
                {h.hitsHigh.map((k) => (
                  <span key={k} className="mr-1 rounded-sm bg-[#f23645]/20 px-1 text-[#f23645]">
                    {k}
                  </span>
                ))}
                {h.hitsMid.map((k) => (
                  <span key={k} className="mr-1 rounded-sm bg-[#f0b90b]/15 px-1 text-[#f0b90b]">
                    {k}
                  </span>
                ))}
              </div>
              </div>
            )
          })}
        </div>
      )}
    </Panel>
  )
}

/** 资讯跳转目标解析：原文url（如有）→ 关联品种行情（#/materials?id= 自动展开该行）→ 关联公司K线 */
function useNewsNav() {
  const { materialById, COMPANIES } = useAppData()
  const navigate = useNavigate()
  return (n: NewsItem): { hint: string; go: () => void } | null => {
    if (n.url)
      return {
        hint: '打开资讯原文（新窗口）',
        go: () => window.open(n.url, '_blank', 'noopener,noreferrer'),
      }
    for (const [kw, id] of NEWS_KEYWORD_MAP) {
      if (n.title.includes(kw) && materialById.has(id)) {
        const m = materialById.get(id)!
        return { hint: `转跳到品种行情：${m.name}`, go: () => navigate(`/materials?id=${id}`) }
      }
    }
    const c = COMPANIES.find((x) => x.name === n.company)
    if (c)
      return {
        hint: `转跳到公司K线：${c.name}`,
        go: () => navigate(`/kline?code=${encodeURIComponent(c.code)}`),
      }
    return null
  }
}

/* ============ 相关资讯侧栏 ============ */
function NewsSidebar() {
  const { NEWS_EXT } = useAppData()
  const newsNav = useNewsNav()
  const [filter, setFilter] = useState('')
  const filtered = useMemo(() => {
    const f = filter.trim()
    if (!f) return NEWS_EXT
    return NEWS_EXT.filter(
      (n) =>
        n.title.includes(f) ||
        n.company.includes(f) ||
        n.relatedMaterials.some((m) => m.name.includes(f) || m.id === f),
    )
  }, [filter, NEWS_EXT])
  return (
    <Panel
      title="相关资讯"
      source="资讯·新华财经 · 更新 2026-08-21"
      className="flex h-full flex-col"
      bodyClassName="flex min-h-0 flex-1 flex-col"
      extra={
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="按品种/公司过滤"
          className="h-6 w-28 rounded-sm border border-[#2a3442] bg-[#0d1117] px-1.5 py-0.5 text-[11px] text-[#d6dee8] outline-none placeholder:text-[#5c6875] focus:border-[#f0b90b]/60"
        />
      }
    >
      <div className="mb-1 text-[10px] text-[#5c6875]">
        <span className="text-amber">■</span> 与本周异动品种相关的资讯已前置高亮；点击条目转跳关联品种/公司页面
      </div>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1" style={{ maxHeight: 620 }}>
        {filtered.map((n: NewsExt, i: number) => {
          const nav = newsNav(n)
          return (
            <div
              key={i}
              onClick={nav?.go}
              title={nav ? nav.hint : undefined}
              className={`rounded-sm border-l-2 px-2 py-1 ${
                n.hot
                  ? 'border-[#f0b90b] bg-[#f0b90b]/5'
                  : 'border-[#2a3442] bg-[#131922]'
              } ${nav ? 'cursor-pointer transition-colors hover:bg-[#1a2230]' : ''}`}
            >
              <div className="flex items-center gap-1.5 text-[10px] text-[#7d8a9b]">
                <span className="num">{n.date}</span>
                <span className="tag">{n.type}</span>
                <span className="truncate">{n.company}</span>
                {n.relatedMaterials.map((m) => (
                  <span key={m.id} className="tag-import">
                    {m.name}
                    {m.latest?.anomaly ? '⚡' : ''}
                  </span>
                ))}
              </div>
              <div className={`mt-0.5 text-[12px] leading-snug ${n.hot ? 'text-[#f0e6c8]' : 'text-[#c8d2de]'}`}>
                {n.title}
                {nav && <span className="ml-1 text-[10px] text-[#f0b90b]">↗</span>}
              </div>
            </div>
          )
        })}
        {!filtered.length && <Empty text="无匹配资讯" />}
      </div>
    </Panel>
  )
}

/* ============ 传导链速览 ============ */
function ChainOverview() {
  const { DATA, majorAnomalies } = useAppData()
  const rows = majorAnomalies.flatMap((m) =>
    (m.downstream ?? [])
      .filter((d) => d.level === '高')
      .map((d) => ({ m, d })),
  )
  return (
    <Panel
      title="传导链速览 · 重大异动 → 高暴露下游"
      source={`原材料现货·生意社 · 截至 2026-08-28（${DATA.data_week}）`}
    >
      {rows.length === 0 ? (
        <Empty text="本周无「重大异动 × 高暴露」组合" />
      ) : (
        <div className="overflow-x-auto">
          <table className="dt">
            <thead>
              <tr>
                <th>异动品种</th>
                <th>等级</th>
                <th className="text-right">最新价</th>
                <th className="text-right">周环比</th>
                <th>下游公司</th>
                <th>暴露度</th>
                <th>传导逻辑</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ m, d }) => (
                <tr key={m.id + d.code}>
                  <td className="font-semibold text-[#e8eef5]">{m.name}</td>
                  <td>
                    <AnomalyBadge level={m.latest!.anomaly} />
                  </td>
                  <td className="num text-right">
                    {fmtPrice(m.latest!.price)}
                    <span className="ml-0.5 text-[10px] text-[#5c6875]">{m.unit}</span>
                  </td>
                  <td className={`num text-right ${pctClass(m.latest!.wow)}`}>
                    {fmtPct(m.latest!.wow)}
                  </td>
                  <td>
                    <CompanyLink code={d.code} name={d.name} />
                    <span className="ml-1 font-mono text-[10px] text-[#5c6875]">{d.code}</span>
                  </td>
                  <td>
                    <ExpBadge level={d.level} />
                  </td>
                  <td className="text-[#8b98a9]">{d.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}

/* ============ 我的自选横条 ============ */
function WatchlistStrip() {
  const { DATA, MATERIALS, COMPANIES } = useAppData()
  const wl = useWatchlist()
  const navigate = useNavigate()
  const mats = MATERIALS.filter((m) => wl.materials.has(m.id))
  const comps = COMPANIES.filter((c) => wl.companies.has(c.code))

  return (
    <div className="panel px-2.5 py-1.5">
      <div className="flex items-center gap-2 overflow-x-auto">
        <span className="shrink-0 text-[11px] font-bold text-[#f0b90b]">★ 我的自选</span>
        {mats.length === 0 && comps.length === 0 && (
          <span className="text-[11px] text-[#5c6875]">
            点击原材料行情 / 公司K线页行首的 ☆ 加入自选，此处聚合展示
          </span>
        )}
        {mats.map((m) => (
          <button
            key={m.id}
            onClick={() => navigate(`/materials?id=${encodeURIComponent(m.id)}`)}
            className="flex shrink-0 items-center gap-1 rounded-sm border border-[#2a3442] bg-[#131922] px-1.5 py-0.5 text-[11px] hover:border-[#f0b90b]/60"
            title={`${m.id} · ${m.source}`}
          >
            <span className="font-semibold text-[#e8eef5]">{m.name}</span>
            {m.latest ? (
              <>
                <span className={`num ${pctClass(m.latest.wow)}`}>{fmtPct(m.latest.wow)}</span>
                {m.latest.anomaly && <AnomalyBadge level={m.latest.anomaly} />}
              </>
            ) : (
              <span className="text-[#5c6875]">数据不可得</span>
            )}
          </button>
        ))}
        {comps.map((c) => (
          <button
            key={c.code}
            onClick={() => navigate(`/kline?code=${encodeURIComponent(c.code)}`)}
            className="flex shrink-0 items-center gap-1 rounded-sm border border-[#2a3442] bg-[#131922] px-1.5 py-0.5 text-[11px] hover:border-[#f0b90b]/60"
            title={`${c.code} · ${c.industry}`}
          >
            <span className="font-semibold text-[#e8eef5]">{c.name}</span>
            {c.snapshot ? (
              <>
                <span className="num text-[#d6dee8]">{c.snapshot.price.toFixed(2)}</span>
                <span className={`num ${pctClass(c.snapshot.pct)}`}>{fmtPct(c.snapshot.pct)}</span>
              </>
            ) : (
              <span className="text-[#5c6875]">{c.market === 'HK' ? '港股' : '快照不可得'}</span>
            )}
          </button>
        ))}
        <span className="ml-auto hidden shrink-0 font-mono text-[10px] text-[#5c6875] lg:inline">
          数据周 {DATA.data_week} · localStorage 本地保存
        </span>
      </div>
    </div>
  )
}

/* ============ 页面 ============ */
export default function Dashboard() {
  const D = useAppData()
  const { DATA, MATERIALS, anomalousMaterials } = D
  const sorted = useMemo(
    () =>
      [...anomalousMaterials].sort((a, b) =>
        a.latest!.anomaly === b.latest!.anomaly
          ? Math.abs(b.latest!.wow ?? 0) - Math.abs(a.latest!.wow ?? 0)
          : a.latest!.anomaly === '重大异动'
            ? -1
            : 1,
      ),
    [anomalousMaterials],
  )
  return (
    <div className="space-y-2">
      <WatchlistStrip />
      <div className="flex items-stretch justify-between gap-2">
        <div className="flex-1">
          <KpiStrip />
        </div>
        <button
          onClick={() => downloadWeeklyReport(D)}
          className="hidden shrink-0 rounded-sm border border-[#f0b90b]/60 bg-[#f0b90b]/10 px-3 py-2 text-[12px] font-semibold text-[#f0b90b] hover:bg-[#f0b90b]/20 md:block"
        >
          ⬇ 导出异动周报
          <span className="block text-[9px] font-normal text-[#b89a4a]">Markdown · {DATA.data_week}</span>
        </button>
      </div>
      <button
        onClick={() => downloadWeeklyReport(D)}
        className="w-full rounded-sm border border-[#f0b90b]/60 bg-[#f0b90b]/10 px-3 py-1.5 text-[12px] font-semibold text-[#f0b90b] md:hidden"
      >
        ⬇ 导出异动周报（Markdown）
      </button>

      <div className="grid grid-cols-1 gap-2 xl:grid-cols-3">
        {/* 异动卡片区 */}
        <div className="xl:col-span-2">
          <Panel
            title={`本周异动预警（${anomalousMaterials.length} 个品种）`}
            source={`原材料现货·生意社 · 截至 2026-08-28（${DATA.data_week}）`}
            bodyClassName="grid grid-cols-1 gap-2 md:grid-cols-2"
          >
            {sorted.map((m) => (
              <AnomalyCard key={m.id} m={m} />
            ))}
          </Panel>
        </div>
        {/* 资讯侧栏 */}
        <NewsSidebar />
      </div>

      <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
        <ChainOverview />
        <RiskRadar />
      </div>

      <div className="rounded border border-[#232b36] bg-[#11161d] px-3 py-1.5 text-[10.5px] leading-relaxed text-[#7d8a9b]">
        <span className="text-amber">基差提示：</span>
        现货价为生意社评估价，与期货存在基差；期货联动分析为后续扩展项（SPEC 排除项声明）。
        数据新鲜度：原材料现货截至 2026-08-28（{DATA.data_week}）；公司快照/K线截至最近交易日；资讯最新 2026-08-21。
        待采购品种（{MATERIALS.filter((m) => !isConnected(m)).length} 个）数据不可得，详见「数据源与口径」页采购清单。
      </div>
    </div>
  )
}

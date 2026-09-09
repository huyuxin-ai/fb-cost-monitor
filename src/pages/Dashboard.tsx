import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  absvol,
  evalAnomaly,
  fmtPct,
  fmtPrice,
  pctClass,
  streakText,
  IMPORT_DEPENDENT,
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
  CompanyImpactTag,
  Empty,
} from '@/components/terminal'

function formatNewsUpdate(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value.replace('T', ' ').slice(0, 16)
  return parsed.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatNewsPublished(value: string | undefined, fallback: string): string {
  if (!value) return fallback
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return fallback
  return parsed.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function newsFeedStatus(updatedAt: string | undefined, latestDate: string, refreshMinutes = 30) {
  const freshness = updatedAt
    ? `最近收录 ${formatNewsUpdate(updatedAt)}（北京时间）`
    : `当前资讯截至 ${latestDate || '—'}`
  return `多源公开资讯 · 每${refreshMinutes}分钟检查 · ${freshness}`
}

/* ============ KPI ============ */
function KpiStrip() {
  const { DATA, MATERIALS, COMPANIES, latestMaterialDate, majorAnomalies, normalAnomalies } = useAppData()
  const kpis = [
    {
      label: '监控品种数',
      value: `${MATERIALS.length}`,
      sub: '均有价格记录',
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
      sub: latestMaterialDate ? `截至 ${latestMaterialDate}` : '暂无数据',
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
  lines.push(`- 监控品种：${MATERIALS.length} 个`)
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
    lines.push(`- 类别：${m.category} ｜ 更新周期：${m.freq}`)
    if (IMPORT_DEPENDENT.has(m.id)) lines.push(`- 标签：进口依赖·汇率敏感`)
    lines.push(`- 下游影响：`)
    for (const d of m.downstream ?? []) {
      lines.push(`  - ${d.level ? `[${d.level}] ` : ''}${d.name}（${d.code}）— ${d.note}`)
    }
    lines.push('')
  }
  lines.push(`## 三、相关资讯摘要（与异动品种相关前置）`)
  lines.push('')
  for (const n of NEWS_EXT.filter((x) => x.hot).slice(0, 10)) {
    const materials = n.relatedMaterials.map((m) => m.name).join('、')
    lines.push(`- ${n.date} 【${n.type}】${n.title}（${materials} / ${n.source}）`)
  }
  lines.push('')
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
  if (!rules.length) rules.push('已按当前阈值触发')

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
            {m.id} · {m.freq}
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
          下游影响（{m.downstream?.length ?? 0} 家，点击公司查看利润影响）
        </div>
        <div className="flex flex-wrap gap-1">
          {(m.downstream ?? []).map((d) => (
            <CompanyImpactTag
              key={d.code}
              material={m}
              downstream={d}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

/* ============ 公告风险雷达 ============ */
function RiskRadar() {
  const { DATA, latestNewsDate, scanAnnouncementRisk } = useAppData()
  const { config } = useThresholds()
  const { hits, scanned, windowStart } = scanAnnouncementRisk(config.announcement)
  const newsNav = useNewsNav()
  const windowEnd = (DATA.news_updated_at || DATA.generated_at).slice(0, 10)
  return (
    <Panel
      title="原材料资讯风险雷达"
      source={`${newsFeedStatus(DATA.news_updated_at, latestNewsDate, DATA.news_refresh_minutes ?? 30)} · 窗口 ${windowStart}~${windowEnd}`}
      extra={
        <span className="font-mono text-[10px] text-[#7d8a9b]">
          扫描 {scanned} 条 / 命中 {hits.length}
        </span>
      }
    >
      {hits.length === 0 ? (
        <div className="py-2">
          <Empty text={`扫描窗口内（${config.announcement.scanWindowDays}天）无命中风险关键词的原材料资讯`} />
          <div className="px-1 pb-1 text-[10px] text-[#5c6875]">
            高风险词：[{config.announcement.keywordsHigh.join(' / ')}]（≥{config.announcement.scoreHigh}分）；
            中风险词：[{config.announcement.keywordsMid.join(' / ')}]（≥{config.announcement.scoreMid}分）。
            关键词与分值阈值可在「阈值配置」页调整。
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          {hits.map((h) => {
            const nav = newsNav(h.news)
            return (
              <div
                key={h.news.id}
                onClick={nav?.go}
                title={nav ? nav.hint : undefined}
                className={`rounded-sm border px-2 py-1.5 ${
                  h.level === '高'
                    ? 'border-[#f23645]/70 bg-[#f23645]/5'
                    : 'border-[#f0b90b]/60 bg-[#f0b90b]/5'
                } ${nav ? 'cursor-pointer transition-colors hover:bg-[#1a2230]' : ''}`}
              >
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  className={`num rounded-sm px-1 text-[11px] font-bold ${
                    h.level === '高' ? 'bg-[#f23645] text-white' : 'bg-[#f0b90b] text-[#1a1305]'
                  }`}
                >
                  {h.score}
                </span>
                <span className="text-[10px] text-[#7d8a9b]">
                  {formatNewsPublished(h.news.published_at, h.news.date)}
                </span>
                <span className="tag">{h.news.type}</span>
                <span className="text-[11px] text-[#8b98a9]">{h.news.source}</span>
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

/** 资讯跳转目标解析：原文 URL（如有）→ 后端已关联的原材料行情 */
function useNewsNav() {
  const { materialById } = useAppData()
  const navigate = useNavigate()
  return (n: NewsItem): { hint: string; go: () => void } | null => {
    if (n.url)
      return {
        hint: '打开资讯原文（新窗口）',
        go: () => window.open(n.url, '_blank', 'noopener,noreferrer'),
      }
    const id = n.material_ids.find((materialId) => materialById.has(materialId))
    if (id) {
      const m = materialById.get(id)!
      return {
        hint: `转跳到原材料行情：${m.name}`,
        go: () => navigate(`/materials?id=${encodeURIComponent(id)}`),
      }
    }
    return null
  }
}

/* ============ 相关资讯侧栏 ============ */
function NewsSidebar() {
  const { DATA, NEWS_EXT, latestNewsDate } = useAppData()
  const newsNav = useNewsNav()
  const [filter, setFilter] = useState('')
  const filtered = useMemo(() => {
    const f = filter.trim().toLocaleLowerCase()
    if (!f) return NEWS_EXT
    return NEWS_EXT.filter(
      (n) =>
        n.title.toLocaleLowerCase().includes(f) ||
        n.source.toLocaleLowerCase().includes(f) ||
        n.relatedMaterials.some(
          (m) => m.name.toLocaleLowerCase().includes(f) || m.id.toLocaleLowerCase() === f,
        ),
    )
  }, [filter, NEWS_EXT])
  return (
    <Panel
      title="原材料相关新闻"
      source={newsFeedStatus(DATA.news_updated_at, latestNewsDate, DATA.news_refresh_minutes ?? 30)}
      className="flex h-full flex-col"
      bodyClassName="flex min-h-0 flex-1 flex-col"
      headerLayout="stacked"
      extra={
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="品种/来源/标题"
          aria-label="筛选原材料相关新闻"
          className="h-7 w-32 shrink-0 rounded-sm border border-[#2a3442] bg-[#0d1117] px-1.5 py-0.5 text-[11px] text-[#d6dee8] outline-none placeholder:text-[#5c6875] focus:border-[#f0b90b]/60 sm:h-6 sm:w-28"
        />
      }
    >
      <div className="mb-1 text-[10px] text-[#5c6875]">
        <span className="text-amber">■</span> 仅展示与已监控原材料的价格、供需、产量或成本直接相关的新闻；异动品种已前置高亮
      </div>
      <div className="min-h-0 flex-1 space-y-1 xl:max-h-[620px] xl:overflow-y-auto xl:pr-1">
        {filtered.map((n: NewsExt) => {
          const nav = newsNav(n)
          return (
            <div
              key={n.id}
              onClick={nav?.go}
              title={nav ? nav.hint : undefined}
              className={`rounded-sm border-l-2 px-2 py-1 ${
                n.hot
                  ? 'border-[#f0b90b] bg-[#f0b90b]/5'
                  : 'border-[#2a3442] bg-[#131922]'
              } ${nav ? 'cursor-pointer transition-colors hover:bg-[#1a2230]' : ''}`}
            >
              <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-[#7d8a9b]">
                <span className="num shrink-0 whitespace-nowrap">{formatNewsPublished(n.published_at, n.date)}</span>
                <span className="tag">{n.type}</span>
                <span className="max-w-full truncate">{n.source}</span>
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
  const { DATA, latestMaterialDate, majorAnomalies } = useAppData()
  const rows = majorAnomalies.flatMap((m) =>
    (m.downstream ?? [])
      .filter((d) => d.level === '高')
      .map((d) => ({ m, d })),
  )
  return (
    <Panel
      title="传导链速览 · 重大异动 → 高暴露下游"
      source={`原材料现货·生意社 · 截至 ${latestMaterialDate || '—'}（${DATA.data_week}）`}
    >
      {rows.length === 0 ? (
        <Empty text="本周无「重大异动 × 高暴露」组合" />
      ) : (
        <div className="overflow-x-auto">
          <table className="dt min-w-[720px]">
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
                    <CompanyImpactTag material={m} downstream={d} />
                    <span className="ml-1 font-mono text-[10px] text-[#5c6875]">{d.code}</span>
                  </td>
                  <td>
                    {d.level && <ExpBadge level={d.level} />}
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
            title={m.id}
          >
            <span className="font-semibold text-[#e8eef5]">{m.name}</span>
            <span className={`num ${pctClass(m.latest?.wow)}`}>{fmtPct(m.latest?.wow)}</span>
            {m.latest?.anomaly && <AnomalyBadge level={m.latest.anomaly} />}
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
  const { DATA, latestMaterialDate, anomalousMaterials } = D
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
            source={`原材料现货·生意社 · 截至 ${latestMaterialDate || '—'}（${DATA.data_week}）`}
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
    </div>
  )
}

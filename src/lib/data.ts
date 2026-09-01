/* ============ 类型定义 ============ */
export interface SeriesPoint {
  week: string
  date: string
  price: number
  wow: number | null
  streak: number
  anomaly: string
}

export type ExpLevel = '高' | '中' | '低'

export interface Downstream {
  code: string
  name: string
  level: ExpLevel
  note: string
}

export interface Material {
  id: string
  name: string
  category: string
  sub?: string | null
  unit: string
  source: string
  source_status: string
  freq: string
  origin: string
  basis?: string | null
  series: SeriesPoint[]
  latest: SeriesPoint | null
  downstream: Downstream[]
}

export interface CompanySnapshot {
  name: string
  price: number
  pct: number
  week_pct: number
  pe: number
  pb: number
  mktcap: number
  industry: string
  main: string
  month_pct: number
  ytd: number
}

export interface Company {
  code: string
  name: string
  market: 'A' | 'HK'
  industry: string
  main: string
  snapshot: CompanySnapshot | null
  kline_days: number
  has_kline: boolean
}

export interface Sensitivity {
  material: string
  company: string
  cost_ratio: number
  note: string
}

export interface NewsItem {
  date: string
  title: string
  summary: string
  source: string
  type: string
  url: string
  company: string
}

export interface DataSource {
  name: string
  type: string
  status: string
  freq: string
  items: string
  note: string
}

export interface TestLog {
  id: string
  module: string
  issue: string
  result: string
  status: string
  date: string
}

/** 数据管线运行步骤（来自 pipeline/collect_daily.py 的 run_log.json） */
export interface PipelineStep {
  step: string
  status: string // ok / partial / fail
  detail: string
}

export interface PipelineInfo {
  last_run: string | null
  steps: PipelineStep[]
  mode: string
  schedule: string
}

export interface AppData {
  generated_at: string
  data_week: string
  pipeline?: PipelineInfo
  materials: Material[]
  companies: Company[]
  sensitivity: Sensitivity[]
  news: NewsItem[]
  thresholds: {
    anomaly: {
      rule1_streak_weeks: number
      rule2_vol_window: number
      level_major: string
      level_normal: string
    }
    announcement_risk: {
      keywords_high: string[]
      keywords_mid: string[]
      scan_window_days: number
      alert_score_high: number
      alert_score_mid: number
    }
  }
  data_sources: DataSource[]
  test_log: TestLog[]
}

/* ============ 常量（与数据无关） ============ */
/** 进口依赖·汇率敏感品种（SPEC 指定） */
export const IMPORT_DEPENDENT = new Set([
  'P', // 棕榈油
  'WPC34',
  'WPC80',
  'WPI90', // 乳清蛋白
  'CASHEW',
  'ALMOND',
  'WALNUT',
  'MACADAMIA', // 坚果
  'BARLEY', // 大麦
  'ANCHOVY', // 鳀鱼
])

export const isConnected = (m: Material) => m.source_status === '已接入'

/* ============ 行情计算（纯函数） ============ */
/** 前 N 周均波动（|wow| 均值，不含最新周） */
export function absvol(m: Material, n = 4): number | null {
  const pts = m.series.filter((p) => p.wow != null)
  if (pts.length < 2) return null
  const prev = pts.slice(-(n + 1), -1)
  if (!prev.length) return null
  return prev.reduce((s, p) => s + Math.abs(p.wow!), 0) / prev.length
}

export interface AnomalyEval {
  level: '重大异动' | '普通异动' | ''
  rule1: boolean
  rule2: boolean
  streak: number
  refVol: number | null
  wow: number | null
}

/** 按阈值配置在前端重算某品种最新周异动（预览口径） */
export function evalAnomaly(
  m: Material,
  cfg: { streakWeeks: number; volWindow: number; volMultiplier: number },
): AnomalyEval {
  const pts = m.series.filter((p) => p.wow != null)
  if (!pts.length) return { level: '', rule1: false, rule2: false, streak: 0, refVol: null, wow: null }
  const last = pts[pts.length - 1]
  // 重算连续同向周数
  let streak = 0
  const sign = Math.sign(last.wow!)
  if (sign !== 0) {
    for (let i = pts.length - 1; i >= 0; i--) {
      if (Math.sign(pts[i].wow!) === sign) streak += sign
      else break
    }
  }
  const prev = pts.slice(-(cfg.volWindow + 1), -1)
  const refVol = prev.length
    ? prev.reduce((s, p) => s + Math.abs(p.wow!), 0) / prev.length
    : null
  const rule1 = Math.abs(streak) >= cfg.streakWeeks
  const rule2 = refVol != null && Math.abs(last.wow!) >= refVol * cfg.volMultiplier
  const level = rule1 && rule2 ? '重大异动' : rule1 || rule2 ? '普通异动' : ''
  return { level, rule1, rule2, streak, refVol, wow: last.wow }
}

/* ============ 资讯关联 ============ */
export interface NewsExt extends NewsItem {
  relatedMaterials: Material[]
  hot: boolean
}

export interface RiskHit {
  news: NewsItem
  score: number
  hitsHigh: string[]
  hitsMid: string[]
  level: '高' | '中' | ''
}

/* ============ 格式化 ============ */
export const fmtPct = (v: number | null | undefined, digits = 2) =>
  v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(digits)}%`

export const pctClass = (v: number | null | undefined) =>
  v == null ? 'text-[#7d8a9b]' : v > 0 ? 'text-up' : v < 0 ? 'text-down' : 'text-[#c8d2de]'

export const fmtPrice = (v: number | null | undefined) =>
  v == null
    ? '—'
    : v.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

export const fmtMktcap = (v: number) => `${(v / 1e8).toLocaleString('zh-CN', { maximumFractionDigits: 0 })}亿`

export const streakText = (s: number) =>
  s === 0 ? '—' : s > 0 ? `连涨${s}周` : `连跌${-s}周`

/* ============ 派生数据集（由 AppDataProvider 构建，经 Context 下发） ============ */
export interface Derived {
  DATA: AppData
  MATERIALS: Material[]
  COMPANIES: Company[]
  NEWS: NewsItem[]
  SENSITIVITY: Sensitivity[]
  materialById: Map<string, Material>
  companyByCode: Map<string, Company>
  CATEGORIES: string[]
  anomalousMaterials: Material[]
  majorAnomalies: Material[]
  normalAnomalies: Material[]
  hotCompanyNames: Set<string>
  NEWS_EXT: NewsExt[]
  /** 公司 → 关联品种（作为下游出现） */
  materialsOfCompany: (code: string) => { material: Material; level: ExpLevel; note: string }[]
  /** 品种 → 敏感度条目 */
  sensitivityOfMaterial: (id: string) => Sensitivity[]
  sensitivityOfCompany: (code: string) => Sensitivity[]
  /** 公告风险扫描（绑定当前数据集） */
  scanAnnouncementRisk: (cfg: {
    keywordsHigh: string[]
    keywordsMid: string[]
    scoreHigh: number
    scoreMid: number
    scanWindowDays: number
  }) => { hits: RiskHit[]; scanned: number; windowStart: string }
}

/** 标题关键词 → 品种（用于资讯与品种挂钩） */
export const NEWS_KEYWORD_MAP: [string, string][] = [
  ['原奶', 'RAW_MILK'],
  ['奶价', 'RAW_MILK'],
  ['生鲜乳', 'RAW_MILK'],
  ['生猪', 'LH'],
  ['猪', 'LH'],
  ['豆粕', 'M'],
  ['菜粕', 'RM'],
  ['棕榈油', 'P'],
  ['豆油', 'Y'],
  ['白糖', 'SR'],
  ['甜菜糖', 'SR'],
  ['玉米', 'C'],
  ['大麦', 'BARLEY'],
  ['纸浆', 'SP'],
  ['玻璃', 'FG'],
  ['PET', 'TA'],
  ['铝', 'AL'],
]

/** 由运行时加载的 app_data.json 构建全部派生数据 */
export function buildDerived(DATA: AppData): Derived {
  const MATERIALS = DATA.materials
  const COMPANIES = DATA.companies
  const NEWS = DATA.news
  const SENSITIVITY = DATA.sensitivity

  const materialById = new Map(MATERIALS.map((m) => [m.id, m]))
  const companyByCode = new Map(COMPANIES.map((c) => [c.code, c]))
  const CATEGORIES = [...new Set(MATERIALS.map((m) => m.category))]

  const anomalousMaterials = MATERIALS.filter((m) => isConnected(m) && m.latest?.anomaly)
  const majorAnomalies = anomalousMaterials.filter((m) => m.latest!.anomaly === '重大异动')
  const normalAnomalies = anomalousMaterials.filter((m) => m.latest!.anomaly === '普通异动')

  const materialsOfCompany = (code: string) => {
    const out: { material: Material; level: ExpLevel; note: string }[] = []
    for (const m of MATERIALS) {
      const d = m.downstream?.find((x) => x.code === code)
      if (d) out.push({ material: m, level: d.level, note: d.note })
    }
    return out
  }

  const sensitivityOfMaterial = (id: string) => SENSITIVITY.filter((s) => s.material === id)
  const sensitivityOfCompany = (code: string) => SENSITIVITY.filter((s) => s.company === code)

  /** 与本周异动品种关联的下游公司集合 */
  const hotCompanyNames = new Set<string>()
  for (const m of anomalousMaterials) {
    for (const d of m.downstream ?? []) hotCompanyNames.add(d.name)
  }

  const extendNews = (n: NewsItem): NewsExt => {
    const related: Material[] = []
    for (const [kw, id] of NEWS_KEYWORD_MAP) {
      if (n.title.includes(kw)) {
        const m = materialById.get(id)
        if (m && !related.includes(m)) related.push(m)
      }
    }
    const hot = hotCompanyNames.has(n.company) || related.some((m) => m.latest?.anomaly)
    return { ...n, relatedMaterials: related, hot }
  }

  const NEWS_EXT: NewsExt[] = NEWS.map(extendNews).sort((a, b) => {
    if (a.hot !== b.hot) return a.hot ? -1 : 1
    return b.date.localeCompare(a.date)
  })

  const scanAnnouncementRisk: Derived['scanAnnouncementRisk'] = (cfg) => {
    const refDate = DATA.generated_at
    const ref = new Date(refDate + 'T00:00:00')
    const start = new Date(ref.getTime() - cfg.scanWindowDays * 86400000)
    const windowStart = start.toISOString().slice(0, 10)
    const inWindow = NEWS.filter((n) => n.date >= windowStart && n.date <= refDate)
    const hits: RiskHit[] = []
    for (const n of inWindow) {
      const text = `${n.title} ${n.summary} ${n.company}`
      const hitsHigh = cfg.keywordsHigh.filter((k) => k && text.includes(k))
      const hitsMid = cfg.keywordsMid.filter(
        (k) => k && !cfg.keywordsHigh.includes(k) && text.includes(k),
      )
      const score = Math.min(100, hitsHigh.length * 35 + hitsMid.length * 15)
      const level = score >= cfg.scoreHigh ? '高' : score >= cfg.scoreMid ? '中' : ''
      if (level) hits.push({ news: n, score, hitsHigh, hitsMid, level })
    }
    hits.sort((a, b) => b.score - a.score || b.news.date.localeCompare(a.news.date))
    return { hits, scanned: inWindow.length, windowStart }
  }

  return {
    DATA,
    MATERIALS,
    COMPANIES,
    NEWS,
    SENSITIVITY,
    materialById,
    companyByCode,
    CATEGORIES,
    anomalousMaterials,
    majorAnomalies,
    normalAnomalies,
    hotCompanyNames,
    NEWS_EXT,
    materialsOfCompany,
    sensitivityOfMaterial,
    sensitivityOfCompany,
    scanAnnouncementRisk,
  }
}

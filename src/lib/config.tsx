import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useAppData } from './appData'
import type { AppData } from './data'

/* ============ 阈值配置（localStorage 持久化 + 变更留痕） ============ */
export interface AnomalyCfg {
  streakWeeks: number
  volWindow: number
  volMultiplier: number
}

export interface AnnounceCfg {
  keywordsHigh: string[]
  keywordsMid: string[]
  scoreHigh: number
  scoreMid: number
  scanWindowDays: number
}

export interface ThresholdConfig {
  anomaly: AnomalyCfg
  announcement: AnnounceCfg
}

/** 由运行时数据构建默认阈值配置 */
export function buildDefaultConfig(DATA: AppData): ThresholdConfig {
  return {
    anomaly: {
      streakWeeks: DATA.thresholds.anomaly.rule1_streak_weeks,
      volWindow: DATA.thresholds.anomaly.rule2_vol_window,
      volMultiplier: 1.0,
    },
    announcement: {
      keywordsHigh: [...DATA.thresholds.announcement_risk.keywords_high],
      keywordsMid: [...DATA.thresholds.announcement_risk.keywords_mid],
      scoreHigh: DATA.thresholds.announcement_risk.alert_score_high,
      scoreMid: DATA.thresholds.announcement_risk.alert_score_mid,
      scanWindowDays: DATA.thresholds.announcement_risk.scan_window_days,
    },
  }
}

export interface ChangeLogEntry {
  time: string
  summary: string
}

const CFG_KEY = 'fcm.thresholds.v1'
const LOG_KEY = 'fcm.thresholdLog.v1'

function loadConfig(defaults: ThresholdConfig): ThresholdConfig {
  try {
    const s = localStorage.getItem(CFG_KEY)
    if (s) {
      const parsed = JSON.parse(s) as ThresholdConfig
      // 与默认值合并，容忍旧版本字段缺失
      return {
        anomaly: { ...defaults.anomaly, ...parsed.anomaly },
        announcement: { ...defaults.announcement, ...parsed.announcement },
      }
    }
  } catch {
    /* ignore */
  }
  return defaults
}

export function loadLog(): ChangeLogEntry[] {
  try {
    const s = localStorage.getItem(LOG_KEY)
    if (s) return JSON.parse(s) as ChangeLogEntry[]
  } catch {
    /* ignore */
  }
  return []
}

/** 生成配置差异摘要（留痕内容） */
export function diffConfig(a: ThresholdConfig, b: ThresholdConfig): string {
  const parts: string[] = []
  const num = (label: string, x: number, y: number) => {
    if (x !== y) parts.push(`${label} ${x}→${y}`)
  }
  num('连续周数', a.anomaly.streakWeeks, b.anomaly.streakWeeks)
  num('波动窗口', a.anomaly.volWindow, b.anomaly.volWindow)
  num('波动倍数', a.anomaly.volMultiplier, b.anomaly.volMultiplier)
  num('高风险分阈值', a.announcement.scoreHigh, b.announcement.scoreHigh)
  num('中风险分阈值', a.announcement.scoreMid, b.announcement.scoreMid)
  num('扫描窗口天数', a.announcement.scanWindowDays, b.announcement.scanWindowDays)
  const kw = (label: string, x: string[], y: string[]) => {
    const added = y.filter((k) => !x.includes(k))
    const removed = x.filter((k) => !y.includes(k))
    if (added.length) parts.push(`${label}+[${added.join('/')}]`)
    if (removed.length) parts.push(`${label}-[${removed.join('/')}]`)
  }
  kw('高风险词', a.announcement.keywordsHigh, b.announcement.keywordsHigh)
  kw('中风险词', a.announcement.keywordsMid, b.announcement.keywordsMid)
  return parts.length ? parts.join('；') : '（内容无变化）'
}

interface CfgCtx {
  config: ThresholdConfig
  defaults: ThresholdConfig
  log: ChangeLogEntry[]
  save: (next: ThresholdConfig) => void
  reset: () => void
  clearLog: () => void
}

const Ctx = createContext<CfgCtx | null>(null)

export function ThresholdProvider({ children }: { children: ReactNode }) {
  const { DATA } = useAppData()
  const defaults = useMemo(() => buildDefaultConfig(DATA), [DATA])
  const [config, setConfig] = useState<ThresholdConfig>(() => loadConfig(defaults))
  const [log, setLog] = useState<ChangeLogEntry[]>(loadLog)

  const persist = useCallback((cfg: ThresholdConfig, entries: ChangeLogEntry[]) => {
    localStorage.setItem(CFG_KEY, JSON.stringify(cfg))
    localStorage.setItem(LOG_KEY, JSON.stringify(entries))
  }, [])

  const save = useCallback(
    (next: ThresholdConfig) => {
      setConfig((prev) => {
        const entry: ChangeLogEntry = {
          time: new Date().toLocaleString('zh-CN', { hour12: false }),
          summary: diffConfig(prev, next),
        }
        setLog((prevLog) => {
          const nextLog = [entry, ...prevLog].slice(0, 100)
          persist(next, nextLog)
          return nextLog
        })
        return next
      })
    },
    [persist],
  )

  const reset = useCallback(() => {
    setConfig((prev) => {
      const entry: ChangeLogEntry = {
        time: new Date().toLocaleString('zh-CN', { hour12: false }),
        summary: `恢复默认（${diffConfig(prev, defaults)}）`,
      }
      setLog((prevLog) => {
        const nextLog = [entry, ...prevLog].slice(0, 100)
        persist(defaults, nextLog)
        return nextLog
      })
      return defaults
    })
  }, [persist, defaults])

  const clearLog = useCallback(() => {
    setLog([])
    localStorage.setItem(LOG_KEY, '[]')
  }, [])

  const value = useMemo(
    () => ({ config, defaults, log, save, reset, clearLog }),
    [config, defaults, log, save, reset, clearLog],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useThresholds(): CfgCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useThresholds must be used within ThresholdProvider')
  return ctx
}

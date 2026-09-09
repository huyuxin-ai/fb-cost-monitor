import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { buildDerived, type AppData, type Derived, type NewsItem } from './data'
import { SITE } from '@/config'

/**
 * 运行时数据加载：app_data.json 由数据管线每日重建并放到 public/data/，
 * 站点启动时以相对路径 fetch（兼容 GitHub Pages 子路径部署），经 Context 下发各页面。
 */
const DATA_URL = 'data/app_data.json'
const NEWS_URL = 'data/news.json'
const NEWS_POLL_MS = 5 * 60 * 1000

interface NewsFeed {
  updated_at?: string
  refresh_minutes?: number
  items: NewsItem[]
}

const Ctx = createContext<Derived | null>(null)

export function useAppData(): Derived {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAppData must be used within AppDataProvider')
  return ctx
}

/* ============ 加载骨架屏 ============ */
function LoadingSkeleton() {
  return (
    <div className="flex min-h-screen flex-col bg-[#0d1117]">
      <div className="border-b border-[#232b36] bg-[#11161d] px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-sm bg-[#f0b90b] text-[12px] font-black text-[#1a1305]">
            原
          </span>
          <div>
            <div className="text-[13px] font-bold tracking-wide text-[#e8eef5]">{SITE.fullName}</div>
            <div className="font-mono text-[10px] text-[#5c6875]">
              {SITE.subtitle} · {SITE.version}
            </div>
          </div>
        </div>
      </div>
      <div className="mx-auto w-full max-w-[1680px] flex-1 space-y-2 p-3">
        <div className="flex items-center gap-2 font-mono text-[11px] text-[#7d8a9b]">
          <span className="inline-block h-2 w-2 animate-ping rounded-full bg-[#f0b90b]" />
          正在加载数据 {DATA_URL} …
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="panel h-16 animate-pulse bg-[#131922]" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="panel h-40 animate-pulse bg-[#131922]" />
          ))}
        </div>
      </div>
    </div>
  )
}

/* ============ 加载失败重试态 ============ */
function LoadError({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#0d1117] px-4">
      <div className="rounded border border-[#f23645]/50 bg-[#f23645]/5 px-6 py-5 text-center">
        <div className="text-[15px] font-bold text-[#f23645]">数据加载失败</div>
        <div className="mt-1.5 max-w-md font-mono text-[11px] leading-relaxed text-[#8b98a9]">
          {DATA_URL} — {error}
        </div>
        <div className="mt-1 text-[11px] text-[#5c6875]">
          数据文件由管线每日重建，若刚部署请确认 public/data/app_data.json 已提交。
        </div>
        <button
          onClick={onRetry}
          className="mt-3 rounded-sm bg-[#f0b90b] px-4 py-1.5 text-[12px] font-bold text-[#1a1305] hover:bg-[#ffd24a]"
        >
          ⟳ 重试
        </button>
      </div>
    </div>
  )
}

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData | null>(null)
  const [newsFeed, setNewsFeed] = useState<NewsFeed | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let alive = true
    setError(null)
    fetch(DATA_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<AppData>
      })
      .then((d) => {
        if (!d || !Array.isArray(d.materials)) throw new Error('数据格式不正确（缺少 materials）')
        if (alive) setData(d)
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      alive = false
    }
  }, [attempt])

  // 新闻文件由轻量定时任务更新；页面每 5 分钟检查一次。
  // 如果单独的新闻文件暂时不可用，保留 app_data.json 内的上一份新闻。
  useEffect(() => {
    let alive = true

    const refreshNews = () => {
      const cacheBuster = new URLSearchParams({ t: String(Date.now()) })
      fetch(`${NEWS_URL}?${cacheBuster}`, { cache: 'no-store' })
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          return r.json() as Promise<NewsFeed>
        })
        .then((feed) => {
          if (!feed || !Array.isArray(feed.items)) throw new Error('新闻数据格式不正确')
          if (alive) setNewsFeed(feed)
        })
        .catch(() => {
          // 这里不覆盖旧数据，也不影响行情和公司页正常打开。
        })
    }

    refreshNews()
    const timer = window.setInterval(refreshNews, NEWS_POLL_MS)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  const mergedData = useMemo<AppData | null>(() => {
    if (!data || !newsFeed) return data
    return {
      ...data,
      news: newsFeed.items,
      news_updated_at: newsFeed.updated_at || data.news_updated_at,
      news_refresh_minutes:
        newsFeed.refresh_minutes && newsFeed.refresh_minutes > 0
          ? newsFeed.refresh_minutes
          : data.news_refresh_minutes,
    }
  }, [data, newsFeed])

  const derived = useMemo(() => (mergedData ? buildDerived(mergedData) : null), [mergedData])

  if (error) return <LoadError error={error} onRetry={retry} />
  if (!derived) return <LoadingSkeleton />
  return <Ctx.Provider value={derived}>{children}</Ctx.Provider>
}

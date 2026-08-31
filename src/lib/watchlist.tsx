import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

/* ============ 自选（Watchlist）：localStorage 持久化 ============ */
const KEY = 'fcm.watchlist.v1'

interface WatchlistState {
  materials: string[]
  companies: string[]
}

function load(): WatchlistState {
  try {
    const s = localStorage.getItem(KEY)
    if (s) {
      const p = JSON.parse(s) as Partial<WatchlistState>
      return {
        materials: Array.isArray(p.materials) ? p.materials : [],
        companies: Array.isArray(p.companies) ? p.companies : [],
      }
    }
  } catch {
    /* ignore */
  }
  return { materials: [], companies: [] }
}

interface WatchlistCtx {
  materials: Set<string>
  companies: Set<string>
  toggleMaterial: (id: string) => void
  toggleCompany: (code: string) => void
}

const Ctx = createContext<WatchlistCtx | null>(null)

export function WatchlistProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WatchlistState>(load)

  const update = useCallback((fn: (s: WatchlistState) => WatchlistState) => {
    setState((prev) => {
      const next = fn(prev)
      localStorage.setItem(KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const toggleMaterial = useCallback(
    (id: string) =>
      update((s) => ({
        ...s,
        materials: s.materials.includes(id)
          ? s.materials.filter((x) => x !== id)
          : [...s.materials, id],
      })),
    [update],
  )
  const toggleCompany = useCallback(
    (code: string) =>
      update((s) => ({
        ...s,
        companies: s.companies.includes(code)
          ? s.companies.filter((x) => x !== code)
          : [...s.companies, code],
      })),
    [update],
  )

  const value = useMemo<WatchlistCtx>(
    () => ({
      materials: new Set(state.materials),
      companies: new Set(state.companies),
      toggleMaterial,
      toggleCompany,
    }),
    [state, toggleMaterial, toggleCompany],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useWatchlist(): WatchlistCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useWatchlist must be used within WatchlistProvider')
  return ctx
}

/** 星标按钮（ amber = 已自选 ） */
export function StarButton({
  active,
  onToggle,
  title,
}: {
  active: boolean
  onToggle: () => void
  title?: string
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      title={title ?? (active ? '移出自选' : '加入自选')}
      className={`px-0.5 text-[13px] leading-none transition-colors ${
        active ? 'text-[#f0b90b]' : 'text-[#3a4657] hover:text-[#f0b90b]'
      }`}
    >
      {active ? '★' : '☆'}
    </button>
  )
}

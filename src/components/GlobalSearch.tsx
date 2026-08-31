import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useAppData } from '@/lib/appData'
import { fmtPct, pctClass } from '@/lib/data'
import { AnomalyBadge } from '@/components/terminal'

interface Item {
  kind: 'material' | 'company'
  key: string
  title: string
  sub: string
  to: string
  right?: React.ReactNode
}

/** 全局搜索（Ctrl/Cmd+K 唤起）：品种→原材料页展开；公司→K线页 */
export default function GlobalSearch({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const { MATERIALS, COMPANIES } = useAppData()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      setQ('')
      setIdx(0)
      // 等待渲染后聚焦
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  const items = useMemo<Item[]>(() => {
    const kw = q.trim().toLowerCase()
    const out: Item[] = []
    if (!kw) return out
    for (const m of MATERIALS) {
      if (
        m.name.toLowerCase().includes(kw) ||
        m.id.toLowerCase().includes(kw) ||
        m.category.includes(q.trim())
      ) {
        out.push({
          kind: 'material',
          key: `m:${m.id}`,
          title: m.name,
          sub: `${m.id} · ${m.category}`,
          to: `/materials?id=${encodeURIComponent(m.id)}`,
          right: m.latest ? (
            <span className="flex items-center gap-1.5">
              <span className={`num ${pctClass(m.latest.wow)}`}>{fmtPct(m.latest.wow)}</span>
              {m.latest.anomaly && <AnomalyBadge level={m.latest.anomaly} />}
            </span>
          ) : (
            <span className="text-[10px] text-[#5c6875]">数据不可得</span>
          ),
        })
      }
      if (out.length >= 8) break
    }
    let n = 0
    for (const c of COMPANIES) {
      if (n >= 8) break
      if (c.name.toLowerCase().includes(kw) || c.code.toLowerCase().includes(kw)) {
        n++
        out.push({
          kind: 'company',
          key: `c:${c.code}`,
          title: c.name,
          sub: `${c.code} · ${c.market === 'A' ? 'A股' : '港股'} · ${c.industry}`,
          to: `/kline?code=${encodeURIComponent(c.code)}`,
          right: c.snapshot ? (
            <span className={`num ${pctClass(c.snapshot.pct)}`}>{fmtPct(c.snapshot.pct)}</span>
          ) : undefined,
        })
      }
    }
    return out
  }, [q, MATERIALS, COMPANIES])

  useEffect(() => setIdx(0), [items.length])

  const go = (it: Item) => {
    onClose()
    navigate(it.to)
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setIdx((i) => (items.length ? (i + 1) % items.length : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setIdx((i) => (items.length ? (i - 1 + items.length) % items.length : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (items[idx]) go(items[idx])
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-idx="${idx}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [idx])

  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-3 pt-[12vh]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded border border-[#2a3442] bg-[#11161d] shadow-[0_8px_40px_rgba(0,0,0,0.6)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-[#232b36] px-3">
          <span className="text-amber">⌕</span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="搜索品种（名称/代码/类别）或公司（名称/代码）…"
            className="h-10 flex-1 bg-transparent text-[13px] text-[#e8eef5] outline-none placeholder:text-[#5c6875]"
          />
          <kbd className="rounded-sm border border-[#2a3442] px-1 font-mono text-[10px] text-[#5c6875]">
            ESC
          </kbd>
        </div>
        <div ref={listRef} className="max-h-[46vh] overflow-y-auto p-1">
          {q.trim() && items.length === 0 && (
            <div className="py-6 text-center text-[12px] text-[#5c6875]">无匹配结果</div>
          )}
          {!q.trim() && (
            <div className="py-6 text-center text-[11px] text-[#5c6875]">
              输入关键词开始搜索 · ↑↓ 选择 · 回车跳转
            </div>
          )}
          {items.map((it, i) => (
            <button
              key={it.key}
              data-idx={i}
              onClick={() => go(it)}
              onMouseEnter={() => setIdx(i)}
              className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left ${
                i === idx ? 'bg-[#f0b90b]/10' : ''
              }`}
            >
              <span
                className={`rounded-sm px-1 py-px text-[10px] font-bold ${
                  it.kind === 'material'
                    ? 'bg-[#f0b90b]/15 text-[#f0b90b]'
                    : 'bg-[#4aa3ff]/15 text-[#4aa3ff]'
                }`}
              >
                {it.kind === 'material' ? '品种' : '公司'}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-semibold text-[#e8eef5]">
                  {it.title}
                </span>
                <span className="block truncate font-mono text-[10px] text-[#5c6875]">
                  {it.sub}
                </span>
              </span>
              {it.right}
            </button>
          ))}
        </div>
        <div className="border-t border-[#232b36] px-3 py-1 font-mono text-[10px] text-[#5c6875]">
          ↑↓ 选择 · Enter 跳转 · 品种→原材料页展开 · 公司→K线页
        </div>
      </div>
    </div>
  )
}

/** Ctrl/Cmd+K 全局监听 Hook（在 Layout 中使用） */
export function useGlobalSearchHotkey(onToggle: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        onToggle()
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onToggle])
}

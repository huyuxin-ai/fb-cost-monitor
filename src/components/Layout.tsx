import { useState } from 'react'
import { NavLink, Outlet } from 'react-router'
import { useAppData } from '@/lib/appData'
import type { PipelineStep } from '@/lib/data'
import { SITE } from '@/config'
import GlobalSearch, { useGlobalSearchHotkey } from '@/components/GlobalSearch'

const NAV = [
  { to: '/', label: '预警驾驶舱', end: true },
  { to: '/materials', label: '原材料行情' },
  { to: '/kline', label: '公司K线' },
  { to: '/sensitivity', label: '成本敏感度' },
  { to: '/thresholds', label: '阈值配置' },
  { to: '/sources', label: '数据源与口径' },
]

const stepColor = (s: string) =>
  s === 'ok' ? 'text-[#089981]' : s === 'partial' ? 'text-[#f0b90b]' : 'text-[#f23645]'
const stepDot = (s: string) =>
  s === 'ok' ? 'bg-[#089981]' : s === 'partial' ? 'bg-[#f0b90b]' : 'bg-[#f23645]'

/** 顶栏数据状态条：数据周 + 管线最近运行 + 自动更新说明；hover 显示步骤明细 */
function DataStatus() {
  const { DATA } = useAppData()
  const p = DATA.pipeline
  const lastRun = p?.last_run
    ? new Date(p.last_run).toLocaleString('zh-CN', { hour12: false })
    : null
  const steps: PipelineStep[] = p?.steps ?? []
  const hasFail = steps.some((s) => s.status === 'fail')
  const ok = !hasFail

  return (
    <div className="group relative">
      <div className="flex cursor-default items-center gap-1.5 font-mono text-[11px] text-[#8b98a9]">
        <span
          className={`inline-block h-1.5 w-1.5 rounded-full ${ok ? 'bg-[#089981]' : 'bg-[#f23645]'}`}
          title={ok ? '管线状态正常' : '管线存在失败步骤'}
        />
        <span>
          数据周 <span className="text-amber font-bold">{DATA.data_week}</span>
        </span>
        <span className="hidden sm:inline">
          · 管线最近运行{' '}
          <span className="text-[#d6dee8]">{lastRun ?? '暂无记录（待首次自动运行）'}</span>
        </span>
        <span className="hidden lg:inline">· {SITE.updateNote}</span>
      </div>
      {/* hover：管线步骤明细 */}
      <div className="invisible absolute right-0 top-full z-50 mt-1 w-80 rounded border border-[#2a3442] bg-[#11161d] p-2 opacity-0 shadow-[0_8px_30px_rgba(0,0,0,0.55)] transition-opacity group-hover:visible group-hover:opacity-100">
        <div className="mb-1 flex items-center justify-between text-[11px]">
          <span className="font-semibold text-[#d6dee8]">管线运行明细</span>
          <span className="font-mono text-[10px] text-[#5c6875]">
            {p?.mode ?? 'github-actions-cron'} · {p?.schedule ?? SITE.updateNote}
          </span>
        </div>
        {steps.length === 0 ? (
          <div className="py-2 text-center text-[11px] text-[#5c6875]">
            暂无运行记录 —— 由 GitHub Actions {p?.schedule ?? '每交易日 16:30'} 自动重建数据
          </div>
        ) : (
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {steps.map((s, i) => (
              <div key={i} className="flex items-start gap-1.5 text-[11px]">
                <span className={`mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${stepDot(s.status)}`} />
                <span className="shrink-0 font-semibold text-[#d6dee8]">{s.step}</span>
                <span className={`shrink-0 font-mono font-bold ${stepColor(s.status)}`}>
                  {s.status}
                </span>
                {s.detail && <span className="min-w-0 text-[#7d8a9b]">{s.detail}</span>}
              </div>
            ))}
          </div>
        )}
        <div className="mt-1 border-t border-[#1c242f] pt-1 font-mono text-[10px] text-[#5c6875]">
          最近运行：{lastRun ?? '—'} · 详见「数据源与口径」页管线运行日志
        </div>
      </div>
    </div>
  )
}

export default function Layout() {
  const { majorAnomalies, normalAnomalies } = useAppData()
  const [searchOpen, setSearchOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  useGlobalSearchHotkey(() => setSearchOpen((v) => !v))

  return (
    <div className="flex min-h-full flex-col bg-[#0d1117]">
      {/* 顶部终端条 */}
      <header className="sticky top-0 z-40 border-b border-[#232b36] bg-[#11161d]">
        <div className="flex items-center gap-3 px-3 pt-1.5">
          {/* 移动端抽屉按钮 */}
          <button
            onClick={() => setDrawerOpen(true)}
            className="flex h-6 w-6 items-center justify-center rounded-sm border border-[#2a3442] text-[13px] text-[#8b98a9] hover:border-[#f0b90b]/60 hover:text-[#f0b90b] md:hidden"
            title="打开导航菜单"
          >
            ☰
          </button>
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-sm bg-[#f0b90b] text-[12px] font-black text-[#1a1305]">
              原
            </span>
            <div className="leading-tight">
              <div className="text-[13px] font-bold tracking-wide text-[#e8eef5]">
                {SITE.fullName}
              </div>
              <div className="font-mono text-[10px] text-[#5c6875]">
                {SITE.subtitle} · {SITE.version}
              </div>
            </div>
          </div>
          {/* 搜索入口 */}
          <button
            onClick={() => setSearchOpen(true)}
            className="ml-2 flex h-6 items-center gap-1.5 rounded-sm border border-[#2a3442] bg-[#0d1117] px-2 text-[11px] text-[#5c6875] hover:border-[#f0b90b]/60 hover:text-[#8b98a9]"
          >
            ⌕ <span className="hidden sm:inline">搜索品种/公司</span>
            <kbd className="hidden rounded-sm border border-[#2a3442] px-1 font-mono text-[9px] md:inline">
              Ctrl+K
            </kbd>
          </button>
          <div className="ml-auto flex items-center gap-3 font-mono text-[11px] text-[#8b98a9]">
            <DataStatus />
            <span className="hidden xl:inline">
              异动{' '}
              <span className="text-amber font-bold">{majorAnomalies.length}</span>重大 /{' '}
              <span className="text-[#d6dee8]">{normalAnomalies.length}</span>普通
            </span>
          </div>
        </div>
        {/* 桌面端导航 */}
        <nav className="mt-1 hidden items-center gap-0.5 overflow-x-auto px-2 md:flex">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `whitespace-nowrap border-b-2 px-3 py-1.5 text-[12.5px] transition-colors ${
                  isActive
                    ? 'border-[#f0b90b] font-semibold text-[#f0b90b]'
                    : 'border-transparent text-[#8b98a9] hover:text-[#d6dee8]'
                }`
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
      </header>

      {/* 移动端抽屉导航 */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDrawerOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-60 border-r border-[#232b36] bg-[#11161d] p-2">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-[12px] font-bold text-[#e8eef5]">{SITE.name}</span>
              <button
                onClick={() => setDrawerOpen(false)}
                className="text-[14px] text-[#5c6875] hover:text-white"
              >
                ×
              </button>
            </div>
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                onClick={() => setDrawerOpen(false)}
                className={({ isActive }) =>
                  `block rounded-sm px-3 py-2 text-[13px] ${
                    isActive
                      ? 'bg-[#f0b90b]/10 font-semibold text-[#f0b90b]'
                      : 'text-[#8b98a9] hover:bg-[#1a2230]'
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </div>
        </div>
      )}

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />

      <main className="mx-auto w-full max-w-[1680px] flex-1 p-2 md:p-3">
        <Outlet />
      </main>
      <footer className="border-t border-[#232b36] px-3 py-1.5 font-mono text-[10px] text-[#5c6875]">
        口径提示：现货价为生意社评估价，与期货存在基差；期货联动分析为后续扩展项（SPEC 排除项）。成本占营收比为分析师经验假设 v1，待年报校准。A股口径：红涨绿跌。{SITE.hosting}。
      </footer>
    </div>
  )
}

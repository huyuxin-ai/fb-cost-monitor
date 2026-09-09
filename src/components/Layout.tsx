import { useState } from 'react'
import { NavLink, Outlet } from 'react-router'
import { useAppData } from '@/lib/appData'
import { SITE } from '@/config'
import GlobalSearch, { useGlobalSearchHotkey } from '@/components/GlobalSearch'

const NAV = [
  { to: '/', label: '预警驾驶舱', end: true },
  { to: '/materials', label: '原材料行情' },
  { to: '/kline', label: '公司K线' },
  { to: '/sensitivity', label: '成本敏感度' },
  { to: '/thresholds', label: '阈值配置' },
]

/** 顶栏只保留客户需要的数据周与更新时间 */
function DataStatus() {
  const { DATA } = useAppData()
  const p = DATA.pipeline
  const lastRun = p?.last_run
    ? new Date(p.last_run).toLocaleString('zh-CN', { hour12: false })
    : null
  const hasFail = (p?.steps ?? []).some((s) => s.status === 'fail')
  const ok = !hasFail

  return (
    <div className="flex cursor-default items-center gap-1.5 font-mono text-[11px] text-[#8b98a9]">
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${ok ? 'bg-[#089981]' : 'bg-[#f23645]'}`}
        title={ok ? '数据状态正常' : '数据更新异常'}
      />
      <span>
        数据周 <span className="text-amber font-bold">{DATA.data_week}</span>
      </span>
      <span className="hidden sm:inline">
        · 更新于 <span className="text-[#d6dee8]">{lastRun ?? DATA.generated_at}</span>
      </span>
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
        <div className="flex min-w-0 items-center gap-2 px-2 pt-1.5 sm:gap-3 sm:px-3">
          {/* 移动端抽屉按钮 */}
          <button
            onClick={() => setDrawerOpen(true)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-[#2a3442] text-[15px] text-[#8b98a9] hover:border-[#f0b90b]/60 hover:text-[#f0b90b] sm:h-7 sm:w-7 md:hidden"
            title="打开导航菜单"
            aria-label="打开导航菜单"
          >
            ☰
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm bg-[#f0b90b] text-[12px] font-black text-[#1a1305]">
              原
            </span>
            <div className="min-w-0 leading-tight">
              <div className="truncate text-[13px] font-bold tracking-wide text-[#e8eef5] sm:hidden">
                {SITE.name}
              </div>
              <div className="hidden text-[13px] font-bold tracking-wide text-[#e8eef5] sm:block">
                {SITE.fullName}
              </div>
              <div className="hidden font-mono text-[10px] text-[#5c6875] sm:block">
                {SITE.subtitle} · {SITE.version}
              </div>
            </div>
          </div>
          {/* 搜索入口 */}
          <button
            onClick={() => setSearchOpen(true)}
            className="flex h-8 w-8 shrink-0 items-center justify-center gap-1.5 rounded-sm border border-[#2a3442] bg-[#0d1117] px-0 text-[13px] text-[#5c6875] hover:border-[#f0b90b]/60 hover:text-[#8b98a9] sm:ml-2 sm:h-6 sm:w-auto sm:px-2 sm:text-[11px]"
            aria-label="搜索品种或公司"
          >
            ⌕ <span className="hidden sm:inline">搜索品种/公司</span>
            <kbd className="hidden rounded-sm border border-[#2a3442] px-1 font-mono text-[9px] md:inline">
              Ctrl+K
            </kbd>
          </button>
          <div className="flex shrink-0 items-center gap-3 font-mono text-[11px] text-[#8b98a9] sm:ml-auto">
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
    </div>
  )
}

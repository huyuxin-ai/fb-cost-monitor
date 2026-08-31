import type { ReactNode } from 'react'
import { Link } from 'react-router'
import type { ExpLevel } from '@/lib/data'

/** 面板：标题 + 右上角「数据源·更新时间」标注 */
export function Panel({
  title,
  source,
  stale,
  extra,
  children,
  className = '',
  bodyClassName = '',
}: {
  title: ReactNode
  source?: string
  stale?: boolean
  extra?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-header">
        <div className="flex items-center gap-2">
          <span className="inline-block h-3 w-[3px] bg-[#f0b90b]" />
          <h2 className="panel-title">{title}</h2>
        </div>
        <div className="flex items-center gap-2">
          {extra}
          {source && (
            <span className="src-tag" title="数据源·更新时间">
              {stale && <span className="text-amber">⚠ </span>}
              {source}
            </span>
          )}
        </div>
      </div>
      <div className={`p-2 ${bodyClassName}`}>{children}</div>
    </section>
  )
}

/** 异动等级徽章 */
export function AnomalyBadge({ level }: { level: string }) {
  if (level === '重大异动') return <span className="badge-major">重大异动</span>
  if (level === '普通异动') return <span className="badge-normal">普通异动</span>
  return <span className="text-[#5c6875]">—</span>
}

/** 暴露度色块 */
export function ExpBadge({ level }: { level: ExpLevel }) {
  if (level === '高') return <span className="exp-high">高</span>
  if (level === '中') return <span className="exp-mid">中</span>
  return <span className="exp-low">低</span>
}

/** 数据源状态点 */
export function SourceDot({ connected }: { connected: boolean }) {
  return connected ? (
    <span className="inline-flex items-center gap-1 text-[11px] text-[#089981]">
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#089981]" />
      已接入
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[11px] text-[#7d8a9b]">
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#5c6875]" />
      待采购<span className="text-amber">⚠</span>
    </span>
  )
}

/** 跳转公司K线页的链接 */
export function CompanyLink({
  code,
  name,
  className = '',
}: {
  code: string
  name: string
  className?: string
}) {
  return (
    <Link
      to={`/kline?code=${encodeURIComponent(code)}`}
      className={`text-[#d6dee8] underline decoration-[#3a4657] underline-offset-2 hover:text-[#f0b90b] hover:decoration-[#f0b90b] ${className}`}
      title={`查看 ${name} K线`}
    >
      {name}
    </Link>
  )
}

/** 空状态 */
export function Empty({ text }: { text: string }) {
  return (
    <div className="flex h-20 items-center justify-center text-[12px] text-[#5c6875]">
      {text}
    </div>
  )
}

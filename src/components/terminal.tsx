import type { ReactNode } from 'react'
import { Link } from 'react-router'
import {
  fmtPct,
  fmtProfitAmount,
  profitImpactPhrase,
  type Downstream,
  type ExpLevel,
  type ImpactEffect,
  type Material,
} from '@/lib/data'
import { useAppData } from '@/lib/appData'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

/** 面板：标题 + 右上角「数据源·更新时间」标注 */
export function Panel({
  title,
  source,
  stale,
  extra,
  children,
  className = '',
  bodyClassName = '',
  headerLayout = 'responsive',
}: {
  title: ReactNode
  source?: string
  stale?: boolean
  extra?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
  headerLayout?: 'responsive' | 'stacked'
}) {
  return (
    <section className={`panel ${className}`}>
      <div className={`panel-header ${headerLayout === 'stacked' ? 'panel-header-stacked' : ''}`}>
        <div className="panel-heading">
          <span className="inline-block h-3 w-[3px] shrink-0 bg-[#f0b90b]" />
          <h2 className="panel-title">{title}</h2>
        </div>
        <div className="panel-header-meta">
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

const oppositeEffect = (effect: ImpactEffect): ImpactEffect => {
  if (effect === '偏利好') return '偏利空'
  if (effect === '偏利空') return '偏利好'
  return '中性'
}

const effectClass = (effect: ImpactEffect) =>
  effect === '偏利好'
    ? 'border-[#089981]/50 bg-[#089981]/10 text-[#53c9b2]'
    : effect === '偏利空'
      ? 'border-[#f23645]/50 bg-[#f23645]/10 text-[#ff6672]'
      : 'border-[#3a4657] bg-[#1a2230] text-[#aeb9c6]'

const profitLevelClass = (level: ExpLevel) =>
  level === '高'
    ? 'border-[#f23645]/60 bg-[#f23645]/15 text-[#ff6672]'
    : level === '中'
      ? 'border-[#f0b90b]/60 bg-[#f0b90b]/10 text-[#f0b90b]'
      : 'border-[#4a586a] bg-[#26303d] text-[#aeb9c6]'

const profitDeltaClass = (valueYi: number) =>
  valueYi > 0 ? 'text-[#53c9b2]' : valueYi < 0 ? 'text-[#ff6672]' : 'text-[#c8d2de]'

/** 公司影响标签：点击查看传导方向与测算，弹层内再进入 K 线 */
export function CompanyImpactTag({
  material,
  downstream,
  className = '',
  label,
}: {
  material: Material
  downstream: Downstream
  className?: string
  label?: string
}) {
  const { sensitivityOfMaterial, profitSensitivityOfPair, companyByCode } = useAppData()
  const sensitivity = sensitivityOfMaterial(material.id).find(
    (s) => s.company === downstream.code,
  )
  const profitSensitivity = profitSensitivityOfPair(material.id, downstream.code)
  const relation =
    downstream.relation ??
    (material.category.includes('包装') || material.category.includes('包材')
      ? '包装成本'
      : '原料成本')
  const priceUpEffect: ImpactEffect = profitSensitivity
    ? profitSensitivity.plus20_np_change_yi > 0
      ? '偏利好'
      : profitSensitivity.plus20_np_change_yi < 0
        ? '偏利空'
        : '中性'
    : downstream.price_up_effect ?? '偏利空'
  const wow = material.latest?.wow
  const currentEffect: ImpactEffect | null = wow == null
    ? null
    : wow > 0
      ? priceUpEffect
      : wow < 0
        ? oppositeEffect(priceUpEffect)
        : '中性'
  const marginImpact =
    relation !== '竞品替代' && sensitivity && wow != null
      ? -(sensitivity.cost_ratio * wow) / 100
      : null
  const impactNote =
    downstream.impact_note ??
    (relation === '包装成本'
      ? `${material.name}价格上涨会通过“${downstream.note}”抬高包装采购成本；如果产品售价不变，毛利会承压。`
      : `${material.name}价格上涨会通过“${downstream.note}”抬高相关成本；价格下降时则减轻成本压力。`)
  const nextStep = profitSensitivity
    ? profitSensitivity.level === '高'
      ? profitSensitivity.plus20_np_change_yi > 0
        ? '核实产品成交价、出货量和自用原料成本是否同步变化。'
        : '优先核实采购价、库存周期和产品提价传导情况。'
      : '持续跟踪原材料价格，并在新财报发布后更新基准净利润。'
    : null
  const companyHasKline = companyByCode.get(downstream.code)?.has_kline === true

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={`group inline-flex min-h-9 items-center gap-1 whitespace-nowrap rounded-sm border border-[#2a3442] bg-[#131922] px-2 py-1 text-[11px] hover:border-[#f0b90b]/60 sm:min-h-0 sm:px-1.5 sm:py-0.5 ${className}`}
          title={`查看 ${downstream.name} 的利润影响`}
        >
          {relation === '竞品替代' ? (
            <span className="rounded-sm border border-[#4aa3ff]/50 bg-[#4aa3ff]/10 px-1 py-px text-[10px] text-[#7fbdff]">
              替代
            </span>
          ) : !profitSensitivity && downstream.level ? (
            <ExpBadge level={downstream.level} />
          ) : null}
          {profitSensitivity && (
            <span className={`rounded-sm border px-1 py-px text-[10px] font-semibold ${profitLevelClass(profitSensitivity.level)}`}>
              净利{profitSensitivity.level}
            </span>
          )}
          <span className="text-[#d6dee8] group-hover:text-[#f0b90b]">
            {label ?? downstream.name}
          </span>
          {!label && (
            <span className="text-[9px] text-[#5c6875] group-hover:text-[#b89a4a]">影响</span>
          )}
        </button>
      </DialogTrigger>
      <DialogContent
        className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden border-[#2a3442] bg-[#11161d] p-0 text-[#d6dee8] sm:max-w-[640px]"
        onClick={(e) => e.stopPropagation()}
      >
        <DialogHeader className="border-b border-[#232b36] px-4 py-3 pr-12 text-left">
          <DialogTitle className="text-[15px] text-[#e8eef5]">
            {material.name} → {downstream.name}
          </DialogTitle>
          <DialogDescription className="text-[11px] text-[#7d8a9b]">
            {downstream.code} · {relation} · 传导逻辑：{downstream.note}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 space-y-3 overflow-y-auto px-4 py-3">
          {profitSensitivity ? (
            <>
              <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                <span className={`rounded-sm border px-1.5 py-0.5 font-semibold ${profitLevelClass(profitSensitivity.level)}`}>
                  净利{profitSensitivity.level}敏感
                </span>
                <span className="tag">±20%压力情景</span>
              </div>

              <div className="grid grid-cols-[96px_minmax(0,1fr)] items-start gap-x-3 gap-y-2 rounded border border-[#232b36] bg-[#131922] px-3 py-2 text-[12px]">
                <span className="text-[#7d8a9b]">价格上涨时</span>
                <span className={`w-fit rounded-sm border px-2 py-0.5 font-semibold ${effectClass(priceUpEffect)}`}>
                  {priceUpEffect}
                </span>
                <span className="text-[#7d8a9b]">基准归母净利润</span>
                <span className="font-mono text-[#d6dee8]">
                  {profitSensitivity.base_net_profit_yi.toFixed(2)} 亿元 · {profitSensitivity.baseline_year}年
                </span>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {[
                  {
                    title: `原材料 +${profitSensitivity.scenario_price_change_pct}%`,
                    pct: profitSensitivity.plus20_np_change_pct,
                    yi: profitSensitivity.plus20_np_change_yi,
                  },
                  {
                    title: `原材料 -${profitSensitivity.scenario_price_change_pct}%`,
                    pct: profitSensitivity.minus20_np_change_pct,
                    yi: profitSensitivity.minus20_np_change_yi,
                  },
                ].map((scenario) => (
                  <div key={scenario.title} className="rounded border border-[#2a3442] bg-[#131922] px-3 py-2">
                    <div className="text-[10px] text-[#7d8a9b]">{scenario.title}压力情景</div>
                    <div className={`mt-0.5 text-[13px] font-bold ${profitDeltaClass(scenario.yi)}`}>
                      {profitImpactPhrase(profitSensitivity, scenario.yi)}
                    </div>
                    <div className="mt-0.5 font-mono text-[10px] text-[#7d8a9b]">
                      {profitSensitivity.base_net_profit_yi < 0
                        ? `情景变动比例 ${fmtPct(scenario.pct)}（亏损基数，方向以金额为准）`
                        : `相对净利润变动 ${fmtPct(scenario.pct)}`}
                      {' · '}绝对金额 {fmtProfitAmount(scenario.yi)}
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded border border-[#f0b90b]/30 bg-[#f0b90b]/[0.05] px-3 py-2 text-[12px] leading-relaxed text-[#d9cfae]">
                <div><span className="font-semibold text-[#f0b90b]">原因：</span>{profitSensitivity.impact_note}</div>
                <div className="mt-1"><span className="font-semibold text-[#f0b90b]">下一步：</span>{nextStep}</div>
              </div>
            </>
          ) : (
            <>
              <div className="mb-2 text-[10px] text-[#7d8a9b]">该组合尚无净利润压力测试，以下为成本占比测算。</div>
              <div className="grid grid-cols-[92px_1fr] items-center gap-x-3 gap-y-2 rounded border border-[#232b36] bg-[#131922] px-3 py-2 text-[12px]">
                <span className="text-[#7d8a9b]">价格上涨时</span>
                <span className={`w-fit rounded-sm border px-2 py-0.5 font-semibold ${effectClass(priceUpEffect)}`}>
                  {priceUpEffect}
                </span>
                <span className="text-[#7d8a9b]">最新原料变动</span>
                <span className="font-mono text-[#d6dee8]">
                  {material.latest && wow != null
                    ? `${fmtPct(wow)} · 截至 ${material.latest.date}`
                    : '暂无最新价格'}
                </span>
                <span className="text-[#7d8a9b]">本期利润方向</span>
                {currentEffect ? (
                  <span className={`w-fit rounded-sm border px-2 py-0.5 font-semibold ${effectClass(currentEffect)}`}>
                    {currentEffect}
                  </span>
                ) : (
                  <span className="text-[#5c6875]">待有价格后判断</span>
                )}
                <span className="text-[#7d8a9b]">毛利率经验测算</span>
                {marginImpact != null ? (
                  <span className="font-mono font-semibold text-[#e8eef5]">
                    {marginImpact > 0 ? '+' : ''}{marginImpact.toFixed(2)} pct
                  </span>
                ) : (
                  <span className="text-[#5c6875]">
                    {relation === '竞品替代' ? '竞品关系不套用成本公式' : '成本占比数据待补充'}
                  </span>
                )}
              </div>
              <div className="rounded border border-[#f0b90b]/30 bg-[#f0b90b]/[0.05] px-3 py-2 text-[12px] leading-relaxed text-[#d9cfae]">
                {impactNote}
              </div>
            </>
          )}
        </div>

        <DialogFooter className={`border-t border-[#232b36] px-4 py-3 ${companyHasKline ? 'sm:justify-between' : 'sm:justify-end'}`}>
          <DialogClose asChild>
            <button
              type="button"
              className="min-h-10 rounded-sm border border-[#2a3442] px-3 py-1.5 text-[12px] text-[#8b98a9] hover:text-[#d6dee8] sm:min-h-0"
            >
              关闭
            </button>
          </DialogClose>
          {companyHasKline && (
            <DialogClose asChild>
              <Link
                to={`/kline?code=${encodeURIComponent(downstream.code)}`}
                className="min-h-10 rounded-sm border border-[#f0b90b]/60 bg-[#f0b90b]/10 px-3 py-1.5 text-[12px] font-semibold text-[#f0b90b] hover:bg-[#f0b90b]/20 sm:min-h-0"
              >
                查看公司 K 线 →
              </Link>
            </DialogClose>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

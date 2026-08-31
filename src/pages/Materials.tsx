import { Fragment, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import {
  isConnected,
  absvol,
  fmtPct,
  fmtPrice,
  pctClass,
  streakText,
  IMPORT_DEPENDENT,
  type Material,
} from '@/lib/data'
import { useAppData } from '@/lib/appData'
import { useWatchlist, StarButton } from '@/lib/watchlist'
import { downloadCsv } from '@/lib/csv'
import {
  Panel,
  AnomalyBadge,
  ExpBadge,
  SourceDot,
  CompanyLink,
} from '@/components/terminal'
import EChart from '@/components/EChart'

/* ============ 详情抽屉（展开行） ============ */
function MaterialDetail({ m }: { m: Material }) {
  const { sensitivityOfMaterial, companyByCode } = useAppData()
  const connected = isConnected(m)
  const sens = sensitivityOfMaterial(m.id)

  const chartOption = useMemo(() => {
    if (!connected) return null
    const pts = m.series
    const anomalyPts = pts
      .map((p, i) => ({ i, p }))
      .filter(({ p }) => p.anomaly)
      .map(({ i, p }) => ({ coord: [i, p.price], value: p.anomaly }))
    return {
      backgroundColor: 'transparent',
      animation: false,
      grid: { left: 60, right: 16, top: 24, bottom: 40 },
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#1a2230',
        borderColor: '#2a3442',
        textStyle: { color: '#d6dee8', fontSize: 11 },
        formatter: (params: unknown) => {
          const arr = params as { dataIndex: number }[]
          const p = pts[arr[0].dataIndex]
          return `${p.week}（${p.date}）<br/>价格 <b>${fmtPrice(p.price)}</b> ${m.unit}<br/>周环比 <b>${fmtPct(p.wow)}</b>${p.anomaly ? `<br/><span style="color:#f0b90b">⚡ ${p.anomaly}</span>` : ''}`
        },
      },
      xAxis: {
        type: 'category',
        data: pts.map((p) => p.week),
        axisLine: { lineStyle: { color: '#2a3442' } },
        axisLabel: { color: '#7d8a9b', fontSize: 10, interval: 3 },
      },
      yAxis: {
        type: 'value',
        scale: true,
        axisLabel: { color: '#7d8a9b', fontSize: 10 },
        splitLine: { lineStyle: { color: '#1c242f' } },
      },
      dataZoom: [
        { type: 'inside' },
        { type: 'slider', height: 14, bottom: 4, borderColor: '#2a3442', backgroundColor: '#131922', fillerColor: 'rgba(240,185,11,0.15)', handleStyle: { color: '#f0b90b' }, textStyle: { color: '#7d8a9b', fontSize: 9 } },
      ],
      series: [
        {
          name: m.name,
          type: 'line',
          data: pts.map((p) => p.price),
          showSymbol: false,
          lineStyle: { color: '#f0b90b', width: 1.5 },
          itemStyle: { color: '#f0b90b' },
          markPoint: {
            symbol: 'circle',
            symbolSize: 8,
            itemStyle: { color: '#f23645', borderColor: '#f0b90b', borderWidth: 1 },
            label: { show: false },
            data: anomalyPts as unknown as Record<string, unknown>[],
          },
        },
      ],
    }
  }, [m, connected])

  if (!connected) {
    /* 待采购品种：数据不可得占位卡 */
    return (
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <div className="rounded border border-dashed border-[#3a4657] bg-[#131922] p-3">
          <div className="text-[13px] font-bold text-[#8b98a9]">
            数据不可得 <span className="text-amber">⚠</span>
          </div>
          <div className="mt-2 space-y-1 text-[11px] leading-relaxed text-[#7d8a9b]">
            <div>
              建议采购源：<span className="text-[#d6dee8]">{m.source}</span>
            </div>
            <div>
              更新频率：<span className="num">{m.freq}</span>
            </div>
            <div>
              口径：{m.origin}
              {m.sub ? ` · ${m.sub}` : ''}
            </div>
            <div className="text-[#5c6875]">接入后自动纳入异动监控与压力测试</div>
          </div>
        </div>
        <div className="rounded border border-[#232b36] bg-[#131922] p-2">
          <div className="mb-1 text-[11px] font-semibold text-[#8b98a9]">
            下游公司传导（{m.downstream?.length ?? 0} 家 · 全景仍可见）
          </div>
          <div className="flex flex-wrap gap-1">
            {(m.downstream ?? []).map((d) => (
              <span
                key={d.code}
                className="flex items-center gap-1 rounded-sm border border-[#2a3442] px-1.5 py-0.5 text-[11px]"
                title={d.note}
              >
                <ExpBadge level={d.level} />
                <CompanyLink code={d.code} name={d.name} />
              </span>
            ))}
          </div>
        </div>
        <div className="rounded border border-[#232b36] bg-[#131922] p-2">
          <div className="mb-1 text-[11px] font-semibold text-[#8b98a9]">成本敏感度关联</div>
          {sens.length ? (
            <div className="space-y-0.5 text-[11px]">
              {sens.map((s) => (
                <div key={s.company} className="flex justify-between gap-2">
                  <CompanyLink
                    code={s.company}
                    name={companyByCode.get(s.company)?.name ?? s.company}
                  />
                  <span className="num text-amber">{s.cost_ratio}%</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[11px] text-[#5c6875]">暂无敏感度映射</div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-2 xl:grid-cols-3">
      {/* 走势图 */}
      <div className="rounded border border-[#232b36] bg-[#131922] p-1 xl:col-span-2">
        <div className="flex items-center justify-between px-1.5 pt-1">
          <span className="text-[11px] font-semibold text-[#8b98a9]">
            周度价格走势（26周 · 红点=异动周）
          </span>
          <span className="src-tag">
            {m.source} · 截至 {m.latest?.date}
            {m.basis ? ` · ${m.basis}` : ''}
          </span>
        </div>
        {chartOption && <EChart option={chartOption} height={240} />}
      </div>
      {/* 右侧：下游 + 敏感度 */}
      <div className="space-y-2">
        <div className="rounded border border-[#232b36] bg-[#131922] p-2">
          <div className="mb-1 text-[11px] font-semibold text-[#8b98a9]">
            下游公司传导（{m.downstream?.length ?? 0} 家）
          </div>
          <div className="flex flex-wrap gap-1">
            {(m.downstream ?? []).map((d) => (
              <span
                key={d.code}
                className="flex items-center gap-1 rounded-sm border border-[#2a3442] px-1.5 py-0.5 text-[11px]"
                title={d.note}
              >
                <ExpBadge level={d.level} />
                <CompanyLink code={d.code} name={d.name} />
              </span>
            ))}
          </div>
          {sens.length > 0 && (
            <div className="mt-2 border-t border-[#1c242f] pt-1.5">
              <div className="mb-0.5 text-[10px] text-[#5c6875]">成本敏感度关联（占营收比%·假设v1）</div>
              {sens.map((s) => (
                <div key={s.company} className="flex justify-between gap-2 text-[11px]">
                  <CompanyLink
                    code={s.company}
                    name={companyByCode.get(s.company)?.name ?? s.company}
                  />
                  <span className="num text-amber">{s.cost_ratio}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {/* 26周数据表 */}
      <div className="rounded border border-[#232b36] bg-[#131922] p-1 xl:col-span-3">
        <div className="px-1.5 pt-1 text-[11px] font-semibold text-[#8b98a9]">
          连续 {m.series.length} 周数据
        </div>
        <div className="max-h-56 overflow-y-auto">
          <table className="dt">
            <thead>
              <tr>
                <th>周</th>
                <th>截止日期</th>
                <th className="text-right">价格（{m.unit}）</th>
                <th className="text-right">周环比</th>
                <th className="text-right">连续周数</th>
                <th>异动</th>
              </tr>
            </thead>
            <tbody>
              {[...m.series].reverse().map((p) => (
                <tr key={p.week} className={p.anomaly ? 'bg-[#f0b90b]/5' : ''}>
                  <td className="num">{p.week}</td>
                  <td className="num text-[#8b98a9]">{p.date}</td>
                  <td className="num text-right">{fmtPrice(p.price)}</td>
                  <td className={`num text-right ${pctClass(p.wow)}`}>{fmtPct(p.wow)}</td>
                  <td className="num text-right">{p.streak}</td>
                  <td>{p.anomaly ? <AnomalyBadge level={p.anomaly} /> : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

/* ============ 行情大表 ============ */
export default function MaterialsPage() {
  const { DATA, MATERIALS, CATEGORIES } = useAppData()
  const wl = useWatchlist()
  const [params, setParams] = useSearchParams()
  const [cat, setCat] = useState('全部')
  const [src, setSrc] = useState('全部')
  const [origin, setOrigin] = useState('全部')
  const [kw, setKw] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  // 直达能力：#/materials?id=RAW_MILK → 自动展开该品种行（全局搜索/自选跳转）
  const focusId = params.get('id')
  useEffect(() => {
    if (focusId && MATERIALS.some((m) => m.id === focusId)) {
      setExpanded(focusId)
      setCat('全部')
      setSrc('全部')
      setOrigin('全部')
      setKw('')
    }
  }, [focusId, MATERIALS])

  const toggleRow = (id: string) => {
    const next = expanded === id ? null : id
    setExpanded(next)
    if (next) setParams({ id: next }, { replace: true })
    else setParams({}, { replace: true })
  }

  const rows = useMemo(() => {
    return MATERIALS.filter((m) => {
      if (cat !== '全部' && m.category !== cat) return false
      if (src === '已接入' && !isConnected(m)) return false
      if (src === '待采购' && isConnected(m)) return false
      if (origin === '混合口径' && !m.origin.includes('混合')) return false
      if (origin === '分口径' && !m.origin.includes('分口径')) return false
      if (kw && !m.name.includes(kw) && !m.id.toLowerCase().includes(kw.toLowerCase()))
        return false
      return true
    })
  }, [MATERIALS, cat, src, origin, kw])

  /** 导出当前筛选结果为 CSV（BOM头，中文不乱码） */
  const exportCsv = () => {
    downloadCsv(
      `原材料行情_${DATA.data_week}.csv`,
      ['品种', '代码', '类别', '最新价', '单位', '周环比%', '连续涨跌周数', '前4周均波动%', '异动状态', '数据源', '数据状态', '口径', '标签'],
      rows.map((m) => {
        const l = m.latest
        const v4 = absvol(m, 4)
        const tags = [
          m.origin.includes('混合') ? '国产/进口混合' : '国产/进口分口径',
          ...(IMPORT_DEPENDENT.has(m.id) ? ['进口依赖·汇率敏感'] : []),
        ]
        return [
          m.name,
          m.id,
          m.category,
          isConnected(m) ? l?.price ?? null : '数据不可得',
          m.unit,
          isConnected(m) ? l?.wow ?? null : null,
          isConnected(m) ? l?.streak ?? null : null,
          isConnected(m) && v4 != null ? +v4.toFixed(2) : null,
          isConnected(m) ? l?.anomaly || '' : '',
          m.source,
          m.source_status,
          m.origin,
          tags.join('|'),
        ]
      }),
    )
  }

  const selCls =
    'h-6 rounded-sm border border-[#2a3442] bg-[#0d1117] px-1.5 text-[11px] text-[#d6dee8] outline-none focus:border-[#f0b90b]/60'

  return (
    <Panel
      title={`原材料行情总览（${rows.length}/${MATERIALS.length}）`}
      source={`现货·生意社评估价 · 截至 2026-08-28（${DATA.data_week}）· 待采购源⚠`}
      bodyClassName="p-0"
      extra={
        <div className="flex flex-wrap items-center gap-1">
          <input
            value={kw}
            onChange={(e) => setKw(e.target.value)}
            placeholder="搜索品种"
            className={`${selCls} w-20`}
          />
          <select value={cat} onChange={(e) => setCat(e.target.value)} className={selCls}>
            <option>全部</option>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select value={src} onChange={(e) => setSrc(e.target.value)} className={selCls}>
            <option>全部</option>
            <option>已接入</option>
            <option>待采购</option>
          </select>
          <select value={origin} onChange={(e) => setOrigin(e.target.value)} className={selCls}>
            <option>全部</option>
            <option>混合口径</option>
            <option>分口径</option>
          </select>
          <button
            onClick={exportCsv}
            className="h-6 rounded-sm border border-[#f0b90b]/60 bg-[#f0b90b]/10 px-2 text-[11px] font-semibold text-[#f0b90b] hover:bg-[#f0b90b]/20"
            title="导出当前筛选结果（CSV · UTF-8 BOM）"
          >
            ⬇ 导出CSV
          </button>
        </div>
      }
    >
      <div className="overflow-x-auto">
        <table className="dt">
          <thead>
            <tr>
              <th>品种</th>
              <th>类别</th>
              <th className="text-right">最新价</th>
              <th>单位</th>
              <th className="text-right">周环比</th>
              <th>连续涨跌</th>
              <th className="text-right">前4周均波动</th>
              <th>异动状态</th>
              <th>数据源</th>
              <th>口径/标签</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const l = m.latest
              const v4 = absvol(m, 4)
              const open = expanded === m.id
              const connected = isConnected(m)
              return (
                <Fragment key={m.id}>
                  <tr
                    onClick={() => toggleRow(m.id)}
                    className={`cursor-pointer ${open ? 'bg-[#1a2230]' : ''} ${l?.anomaly ? 'bg-[#f0b90b]/[0.04]' : ''}`}
                  >
                    <td>
                      <StarButton
                        active={wl.materials.has(m.id)}
                        onToggle={() => wl.toggleMaterial(m.id)}
                      />
                      <span className="mr-1 inline-block w-3 text-[#5c6875]">{open ? '▾' : '▸'}</span>
                      <span className="font-semibold text-[#e8eef5]">{m.name}</span>
                      <span className="ml-1 font-mono text-[10px] text-[#5c6875]">{m.id}</span>
                    </td>
                    <td className="text-[#8b98a9]">{m.category}</td>
                    <td className="num text-right font-semibold text-[#e8eef5]">
                      {connected ? fmtPrice(l?.price) : <span className="text-[#5c6875]">数据不可得</span>}
                    </td>
                    <td className="text-[#7d8a9b]">{m.unit}</td>
                    <td className={`num text-right ${pctClass(l?.wow)}`}>
                      {connected ? fmtPct(l?.wow) : '—'}
                    </td>
                    <td className="num text-[#8b98a9]">
                      {connected ? streakText(l?.streak ?? 0) : '—'}
                    </td>
                    <td className="num text-right text-[#8b98a9]">
                      {connected && v4 != null ? `${v4.toFixed(2)}%` : '—'}
                    </td>
                    <td>{connected ? <AnomalyBadge level={l?.anomaly ?? ''} /> : ''}</td>
                    <td>
                      <SourceDot connected={connected} />
                    </td>
                    <td>
                      <span className="tag">{m.origin.includes('混合') ? '国产/进口混合' : '国产/进口分口径'}</span>
                      {IMPORT_DEPENDENT.has(m.id) && (
                        <span className="tag-import ml-1">进口依赖·汇率敏感</span>
                      )}
                    </td>
                  </tr>
                  {open && (
                    <tr>
                      <td colSpan={10} className="bg-[#10151c] p-2">
                        <MaterialDetail m={m} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="border-t border-[#232b36] px-3 py-1.5 text-[10px] text-[#5c6875]">
        注：周环比红涨绿跌（A股口径）；「前4周均波动」为 |周环比| 的4周均值；BZ 瓶片PET为参考口径。点击行展开详情（走势图/26周数据/下游传导/敏感度）；☆ 加入自选。
      </div>
    </Panel>
  )
}

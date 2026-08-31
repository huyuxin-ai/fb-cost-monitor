import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import {
  fmtPct,
  fmtMktcap,
  pctClass,
  type Company,
} from '@/lib/data'
import { useAppData } from '@/lib/appData'
import { useWatchlist, StarButton } from '@/lib/watchlist'
import { loadKline, type KlineData } from '@/lib/kline'
import { Panel, AnomalyBadge, ExpBadge, Empty } from '@/components/terminal'
import EChart from '@/components/EChart'

/* ============ K线图 ============ */
function KlineChart({ company, kdata }: { company: Company; kdata: KlineData }) {
  const entry = kdata[company.code]

  const option = useMemo(() => {
    if (!entry) return null
    const data = entry.data
    const dates = data.map((d) => d.date)
    const ohlc = data.map((d) => [d.open, d.close, d.low, d.high])
    const vols = data.map((d) => ({
      value: d.volume,
      itemStyle: {
        color: d.pct == null ? '#5c6875' : d.pct >= 0 ? '#f23645' : '#089981',
      },
    }))
    const ma = (n: number) =>
      data.map((_, i) => {
        if (i < n - 1) return null
        let s = 0
        for (let j = i - n + 1; j <= i; j++) s += data[j].close
        return +(s / n).toFixed(2)
      })
    return {
      backgroundColor: 'transparent',
      animation: false,
      legend: {
        data: ['MA5', 'MA10', 'MA20'],
        top: 0,
        textStyle: { color: '#7d8a9b', fontSize: 10 },
        itemWidth: 14,
        itemHeight: 2,
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross', label: { backgroundColor: '#2a3442' } },
        backgroundColor: '#1a2230',
        borderColor: '#2a3442',
        textStyle: { color: '#d6dee8', fontSize: 11 },
      },
      axisPointer: { link: [{ xAxisIndex: 'all' }] },
      grid: [
        { left: 56, right: 12, top: 26, height: '56%' },
        { left: 56, right: 12, top: '72%', height: '14%' },
      ],
      xAxis: [
        {
          type: 'category',
          data: dates,
          gridIndex: 0,
          axisLine: { lineStyle: { color: '#2a3442' } },
          axisLabel: { show: false },
        },
        {
          type: 'category',
          data: dates,
          gridIndex: 1,
          axisLine: { lineStyle: { color: '#2a3442' } },
          axisLabel: { color: '#7d8a9b', fontSize: 9 },
        },
      ],
      yAxis: [
        {
          scale: true,
          gridIndex: 0,
          position: 'left',
          axisLabel: { color: '#7d8a9b', fontSize: 10 },
          splitLine: { lineStyle: { color: '#1c242f' } },
        },
        {
          scale: true,
          gridIndex: 1,
          axisLabel: { show: false },
          splitLine: { show: false },
        },
      ],
      dataZoom: [
        { type: 'inside', xAxisIndex: [0, 1], start: 55, end: 100 },
        {
          type: 'slider',
          xAxisIndex: [0, 1],
          bottom: 4,
          height: 16,
          start: 55,
          end: 100,
          borderColor: '#2a3442',
          backgroundColor: '#131922',
          fillerColor: 'rgba(240,185,11,0.15)',
          handleStyle: { color: '#f0b90b' },
          textStyle: { color: '#7d8a9b', fontSize: 9 },
        },
      ],
      series: [
        {
          name: 'K线',
          type: 'candlestick',
          data: ohlc,
          xAxisIndex: 0,
          yAxisIndex: 0,
          itemStyle: {
            color: '#f23645',
            color0: '#089981',
            borderColor: '#f23645',
            borderColor0: '#089981',
          },
        },
        {
          name: 'MA5',
          type: 'line',
          data: ma(5),
          xAxisIndex: 0,
          yAxisIndex: 0,
          showSymbol: false,
          lineStyle: { width: 1, color: '#f0b90b' },
        },
        {
          name: 'MA10',
          type: 'line',
          data: ma(10),
          xAxisIndex: 0,
          yAxisIndex: 0,
          showSymbol: false,
          lineStyle: { width: 1, color: '#4aa3ff' },
        },
        {
          name: 'MA20',
          type: 'line',
          data: ma(20),
          xAxisIndex: 0,
          yAxisIndex: 0,
          showSymbol: false,
          lineStyle: { width: 1, color: '#b57bee' },
        },
        {
          name: '成交量',
          type: 'bar',
          data: vols,
          xAxisIndex: 1,
          yAxisIndex: 1,
          barWidth: '60%',
        },
      ],
    }
  }, [entry])

  if (!entry) return null
  return <EChart option={option!} height={440} />
}

/* ============ 关联原材料风险 ============ */
function RelatedMaterials({ company }: { company: Company }) {
  const { materialsOfCompany } = useAppData()
  const rel = materialsOfCompany(company.code)
  if (!rel.length)
    return <Empty text="该公司不在任何监控品种的下游映射中" />
  return (
    <div className="space-y-1">
      {rel.map(({ material: m, level, note }) => {
        const anomaly = m.latest?.anomaly
        return (
          <div
            key={m.id}
            className={`flex flex-wrap items-center gap-2 rounded-sm border px-2 py-1.5 text-[12px] ${
              anomaly
                ? 'border-[#f0b90b]/60 bg-[#f0b90b]/5'
                : 'border-[#232b36] bg-[#131922]'
            }`}
          >
            {anomaly ? (
              <span className="text-amber">⚠</span>
            ) : (
              <span className="text-[#089981]">●</span>
            )}
            <span className="font-semibold text-[#e8eef5]">{m.name}</span>
            <ExpBadge level={level} />
            {anomaly && <AnomalyBadge level={anomaly} />}
            <span className="text-[#8b98a9]">{note}</span>
            <span className="ml-auto font-mono text-[11px] text-[#7d8a9b]">
              {m.latest
                ? `${m.latest.price.toLocaleString()} ${m.unit} · ${fmtPct(m.latest.wow)} · 截至${m.latest.date}`
                : `数据不可得（${m.source_status}）`}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/* ============ 页面 ============ */
export default function KlinePage() {
  const { COMPANIES } = useAppData()
  const wl = useWatchlist()
  const [params, setParams] = useSearchParams()
  const [kw, setKw] = useState('')
  const [mkt, setMkt] = useState<'全部' | 'A' | 'HK'>('全部')
  const [kdata, setKdata] = useState<KlineData | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)

  // lazy fetch：首次进入K线页加载并缓存
  useEffect(() => {
    let alive = true
    loadKline()
      .then((d) => alive && setKdata(d))
      .catch((e) => alive && setLoadErr(String(e)))
    return () => {
      alive = false
    }
  }, [])

  const list = useMemo(
    () =>
      COMPANIES.filter((c) => {
        if (mkt !== '全部' && c.market !== mkt) return false
        if (kw && !c.name.includes(kw) && !c.code.includes(kw)) return false
        return true
      }),
    [COMPANIES, kw, mkt],
  )

  const code = params.get('code')
  const current: Company =
    (code && COMPANIES.find((c) => c.code === code)) || COMPANIES[0]

  const select = (c: Company) => setParams({ code: c.code }, { replace: true })

  /** 展示快照：A股用行情快照；港股无快照时回退到K线末值 */
  const viewSnap = (c: Company) => {
    if (c.snapshot) {
      return {
        price: c.snapshot.price,
        pct: c.snapshot.pct,
        pe: c.snapshot.pe as number | null,
        pb: c.snapshot.pb as number | null,
        mktcap: c.snapshot.mktcap as number | null,
      }
    }
    const kd = kdata?.[c.code]?.data
    const last = kd?.[kd.length - 1]
    return {
      price: last?.close ?? null,
      pct: last?.pct ?? null,
      pe: null,
      pb: null,
      mktcap: null,
    }
  }

  const snap = viewSnap(current)
  const hasKline = current.has_kline && kdata?.[current.code]

  return (
    <div className="grid grid-cols-1 gap-2 lg:grid-cols-[330px_1fr]">
      {/* 左：公司列表 */}
      <Panel
        title={`公司池（${list.length}/${COMPANIES.length}）`}
        source="行情快照·新浪财经 · 截至最近交易日"
        bodyClassName="flex flex-col p-1.5"
      >
        <div className="mb-1 flex gap-1">
          <input
            value={kw}
            onChange={(e) => setKw(e.target.value)}
            placeholder="搜索代码/名称"
            className="h-6 min-w-0 flex-1 rounded-sm border border-[#2a3442] bg-[#0d1117] px-1.5 text-[11px] text-[#d6dee8] outline-none placeholder:text-[#5c6875] focus:border-[#f0b90b]/60"
          />
          {(['全部', 'A', 'HK'] as const).map((x) => (
            <button
              key={x}
              onClick={() => setMkt(x)}
              className={`h-6 rounded-sm border px-1.5 text-[11px] ${
                mkt === x
                  ? 'border-[#f0b90b]/60 bg-[#f0b90b]/10 text-[#f0b90b]'
                  : 'border-[#2a3442] text-[#8b98a9]'
              }`}
            >
              {x === 'A' ? 'A股' : x === 'HK' ? '港股' : x}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto" style={{ maxHeight: 720 }}>
          <table className="dt">
            <thead>
              <tr>
                <th>名称/代码</th>
                <th className="text-right">最新价</th>
                <th className="text-right">涨幅</th>
                <th className="text-right">PE</th>
                <th className="text-right">市值</th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => {
                const s = viewSnap(c)
                return (
                  <tr
                    key={c.code}
                    onClick={() => select(c)}
                    className={`cursor-pointer ${c.code === current.code ? 'bg-[#f0b90b]/10' : ''}`}
                  >
                    <td>
                      <div className="leading-tight">
                        <StarButton
                          active={wl.companies.has(c.code)}
                          onToggle={() => wl.toggleCompany(c.code)}
                        />
                        <span className={`text-[12px] ${c.code === current.code ? 'font-bold text-[#f0b90b]' : 'text-[#d6dee8]'}`}>
                          {c.name}
                        </span>
                        {!c.has_kline && <span className="ml-1 text-amber" title="无K线数据">⚠</span>}
                        <div className="font-mono text-[9px] text-[#5c6875]">
                          {c.code} · {c.market === 'A' ? 'A股' : '港股'}
                        </div>
                      </div>
                    </td>
                    <td className="num text-right">{s.price != null ? s.price.toFixed(2) : '—'}</td>
                    <td className={`num text-right ${pctClass(s.pct)}`}>
                      {fmtPct(s.pct)}
                    </td>
                    <td className="num text-right text-[#8b98a9]">{s.pe != null ? s.pe.toFixed(1) : '—'}</td>
                    <td className="num whitespace-nowrap text-right text-[#8b98a9]">{s.mktcap != null ? fmtMktcap(s.mktcap) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* 右：K线 */}
      <div className="space-y-2">
        <Panel
          title={
            <span>
              {current.name}
              <span className="ml-2 font-mono text-[11px] font-normal text-[#7d8a9b]">
                {current.code} · {current.market === 'A' ? 'A股' : '港股'} · {current.industry} · 主营：{current.main}
              </span>
            </span>
          }
          source="K线·新浪财经(日频) · 前复权"
          extra={
            <span className="font-mono text-[11px]">
              <span className="num text-[15px] font-bold text-[#e8eef5]">
                {snap.price != null ? snap.price.toFixed(2) : '—'}
              </span>
              <span className={`num ml-2 ${pctClass(snap.pct)}`}>{fmtPct(snap.pct)}</span>
              <span className="ml-2 text-[#7d8a9b]">
                {snap.pe != null ? `PE ${snap.pe.toFixed(1)} · ` : ''}
                {snap.pb != null ? `PB ${snap.pb.toFixed(1)} · ` : ''}
                {snap.mktcap != null ? `市值 ${fmtMktcap(snap.mktcap)}` : current.market === 'HK' ? '快照不可得·取K线末值' : ''}
              </span>
            </span>
          }
          bodyClassName="p-1"
        >
          {!kdata && !loadErr && (
            <div className="flex h-[440px] items-center justify-center text-[12px] text-[#7d8a9b]">
              <span className="animate-pulse">K线数据加载中（首次加载约2.9MB，之后内存缓存）…</span>
            </div>
          )}
          {loadErr && <Empty text={loadErr} />}
          {kdata && !hasKline && (
            <div className="flex h-[440px] flex-col items-center justify-center gap-2 rounded border border-dashed border-[#3a4657] bg-[#131922]">
              <div className="text-[14px] font-bold text-[#8b98a9]">
                {current.name}（{current.code}）K线数据不可得 <span className="text-amber">⚠</span>
              </div>
              <div className="text-[12px] text-[#7d8a9b]">
                数据源无返回（新浪返回空JSON，东财备用亦失败）—— 见测试日志 <span className="text-amber font-mono">T-002</span>
              </div>
              <div className="text-[10px] text-[#5c6875]">缺失数据透明化：不静默剔除，保留占位以便跟踪补数</div>
            </div>
          )}
          {kdata && hasKline && <KlineChart company={current} kdata={kdata} />}
        </Panel>

        <Panel
          title="关联原材料风险"
          source={`原材料现货·生意社 · 截至 2026-08-28`}
        >
          <RelatedMaterials company={current} />
        </Panel>
      </div>
    </div>
  )
}

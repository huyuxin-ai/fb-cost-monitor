import { useMemo, useState } from 'react'
import { fmtPct, type Material } from '@/lib/data'
import { useAppData } from '@/lib/appData'
import { downloadCsv } from '@/lib/csv'
import { Panel, AnomalyBadge, CompanyLink, Empty } from '@/components/terminal'

/* 热度色：成本占营收比 → 琥珀深浅 */
function heatStyle(ratio: number, max: number) {
  const a = 0.08 + (ratio / max) * 0.72
  return {
    backgroundColor: `rgba(240,185,11,${a.toFixed(2)})`,
    color: ratio / max > 0.45 ? '#1a1305' : '#d6dee8',
  }
}

export default function SensitivityPage() {
  const { SENSITIVITY, materialById, companyByCode } = useAppData()
  const matIds = useMemo(() => [...new Set(SENSITIVITY.map((s) => s.material))], [SENSITIVITY])
  const compCodes = useMemo(() => [...new Set(SENSITIVITY.map((s) => s.company))], [SENSITIVITY])
  const maxRatio = useMemo(() => Math.max(...SENSITIVITY.map((s) => s.cost_ratio)), [SENSITIVITY])
  const cellMap = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of SENSITIVITY) m.set(`${s.material}|${s.company}`, s.cost_ratio)
    return m
  }, [SENSITIVITY])

  /* 压力测试模拟器 */
  const anomalousWithSens = matIds.filter((id) => materialById.get(id)?.latest?.anomaly)
  const [simMat, setSimMat] = useState<string>(anomalousWithSens[0] ?? matIds[0])
  const [shock, setShock] = useState(10)

  const simRows = useMemo(() => {
    return SENSITIVITY.filter((s) => s.material === simMat)
      .map((s) => ({
        ...s,
        impact: (s.cost_ratio * shock) / 100, // 毛利率变动 pct（价格上涨→毛利承压为负）
      }))
      .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact))
  }, [SENSITIVITY, simMat, shock])

  /** 导出压力测试结果 CSV（BOM头，中文不乱码） */
  const exportCsv = () => {
    const mName = materialById.get(simMat)?.name ?? simMat
    downloadCsv(
      `压力测试_${mName}_${shock > 0 ? '+' : ''}${shock}pct.csv`,
      ['排名', '公司', '代码', '成本占营收比%', '价格涨幅%', '毛利率影响估算pct', '风险标记', '备注'],
      simRows.map((r, i) => {
        const margin = -r.impact
        return [
          i + 1,
          companyByCode.get(r.company)?.name ?? r.company,
          r.company,
          r.cost_ratio,
          shock,
          +margin.toFixed(2),
          Math.abs(margin) > 3 ? '影响>3pct' : '',
          r.note,
        ]
      }),
    )
  }

  const simMaterial: Material | undefined = materialById.get(simMat)
  const simAnomaly = simMaterial?.latest?.anomaly

  return (
    <div className="space-y-2">
      {/* 口径说明横幅 */}
      <div className="rounded border border-[#f0b90b]/40 bg-[#f0b90b]/[0.06] px-3 py-2 text-[12px] leading-relaxed text-[#d9cfae]">
        <span className="font-bold text-amber">口径说明：</span>
        成本占营收比为<span className="font-bold">分析师经验假设 v1</span>
        （口径：待年报校准），仅用于敏感度排序与压力测试的相对比较，不构成盈利预测。
        压力测试公式：毛利率影响(pct) ≈ −成本占营收比 × 原材料价格涨幅（假设成本完全传导、售价不变）。
      </div>

      {/* 敏感度矩阵 */}
      <Panel
        title={`敏感度矩阵（${matIds.length} 品种 × ${compCodes.length} 公司，仅显示有映射组合）`}
        source="分析师假设v1 · 更新 2026-08-31 · 待年报校准⚠"
        bodyClassName="p-0"
      >
        <div className="overflow-x-auto">
          <table className="dt">
            <thead>
              <tr>
                <th className="min-w-28">原材料 \ 公司</th>
                {compCodes.map((c) => (
                  <th key={c} className="text-center">
                    <div className="whitespace-nowrap">{companyByCode.get(c)?.name ?? c}</div>
                    <div className="font-mono text-[9px] font-normal text-[#5c6875]">{c}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matIds.map((id) => {
                const m = materialById.get(id)!
                return (
                  <tr key={id}>
                    <td>
                      <div className="flex items-center gap-1.5 whitespace-nowrap">
                        <span className="font-semibold text-[#e8eef5]">{m.name}</span>
                        {m.latest?.anomaly && <AnomalyBadge level={m.latest.anomaly} />}
                      </div>
                      <div className="font-mono text-[9px] text-[#5c6875]">
                        {id} · {m.latest ? fmtPct(m.latest.wow) : '数据不可得'}
                      </div>
                    </td>
                    {compCodes.map((c) => {
                      const v = cellMap.get(`${id}|${c}`)
                      return (
                        <td key={c} className="p-0.5 text-center">
                          {v != null ? (
                            <div
                              className="num rounded-sm px-1 py-1 text-[12px] font-bold"
                              style={heatStyle(v, maxRatio)}
                              title={`${m.name} → ${companyByCode.get(c)?.name}：成本占营收比 ${v}%`}
                            >
                              {v}%
                            </div>
                          ) : (
                            <span className="text-[#2a3442]">·</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="flex items-center gap-2 border-t border-[#232b36] px-3 py-1.5 text-[10px] text-[#5c6875]">
          色阶：
          {[5, 10, 15, 20, 25, 30].map((v) => (
            <span key={v} className="num rounded-sm px-1.5 py-px" style={heatStyle(v, maxRatio)}>
              {v}%
            </span>
          ))}
          <span className="ml-2">颜色越深 = 对该原材料越敏感</span>
        </div>
      </Panel>

      {/* 压力测试模拟器 */}
      <Panel
        title="压力测试模拟器"
        source="分析师假设v1 · 实时计算 · 待年报校准⚠"
        className={simAnomaly ? 'border-[#f0b90b]/60' : ''}
        extra={
          <button
            onClick={exportCsv}
            className="rounded-sm border border-[#f0b90b]/60 bg-[#f0b90b]/10 px-2 py-0.5 text-[11px] font-semibold text-[#f0b90b] hover:bg-[#f0b90b]/20"
            title="导出当前压力测试结果（CSV · UTF-8 BOM）"
          >
            ⬇ 导出CSV
          </button>
        }
      >
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <label className="text-[12px] text-[#8b98a9]">
            原材料：
            <select
              value={simMat}
              onChange={(e) => setSimMat(e.target.value)}
              className="ml-1 h-7 rounded-sm border border-[#2a3442] bg-[#0d1117] px-1.5 text-[12px] text-[#d6dee8] outline-none focus:border-[#f0b90b]/60"
            >
              {matIds.map((id) => {
                const m = materialById.get(id)!
                return (
                  <option key={id} value={id}>
                    {m.name}
                    {m.latest?.anomaly ? `（${m.latest.anomaly}中）` : ''}
                  </option>
                )
              })}
            </select>
          </label>
          {simAnomaly && (
            <span className="flex items-center gap-1">
              <span className="text-amber">⚡ 当前已触发异动：</span>
              <AnomalyBadge level={simAnomaly} />
              <span className="num text-[11px] text-[#8b98a9]">
                本周{fmtPct(simMaterial?.latest?.wow)}
              </span>
            </span>
          )}
          <label className="flex flex-1 items-center gap-2 text-[12px] text-[#8b98a9]">
            价格涨幅
            <input
              type="range"
              min={-20}
              max={30}
              step={1}
              value={shock}
              onChange={(e) => setShock(Number(e.target.value))}
              className="h-1 w-56 cursor-pointer appearance-none rounded bg-[#2a3442] accent-[#f0b90b]"
            />
            <span
              className={`num w-16 text-center text-[16px] font-bold ${
                shock > 0 ? 'text-up' : shock < 0 ? 'text-down' : 'text-[#c8d2de]'
              }`}
            >
              {shock > 0 ? '+' : ''}
              {shock}%
            </span>
          </label>
        </div>
        {simRows.length ? (
          <div className="overflow-x-auto">
          <table className="dt">
            <thead>
              <tr>
                <th>#</th>
                <th>公司</th>
                <th className="text-right">成本占营收比</th>
                <th className="text-right">毛利率影响估算</th>
                <th>风险标记</th>
                <th>备注</th>
              </tr>
            </thead>
            <tbody>
              {simRows.map((r, i) => {
                const margin = -r.impact // 价格上涨 → 毛利率下降
                const severe = Math.abs(margin) > 3
                return (
                  <tr key={r.company} className={severe ? 'bg-[#f23645]/[0.06]' : ''}>
                    <td className="num text-[#5c6875]">{i + 1}</td>
                    <td>
                      <CompanyLink
                        code={r.company}
                        name={companyByCode.get(r.company)?.name ?? r.company}
                      />
                      <span className="ml-1 font-mono text-[10px] text-[#5c6875]">{r.company}</span>
                    </td>
                    <td className="num text-right text-amber">{r.cost_ratio}%</td>
                    <td
                      className={`num text-right font-bold ${
                        severe ? 'text-up' : margin > 0 ? 'text-down' : margin < 0 ? 'text-up' : 'text-[#c8d2de]'
                      }`}
                    >
                      {margin > 0 ? '+' : ''}
                      {margin.toFixed(2)} pct
                    </td>
                    <td>
                      {severe ? (
                        <span className="rounded-sm bg-[#f23645] px-1.5 py-px text-[11px] font-bold text-white">
                          影响&gt;3pct
                        </span>
                      ) : (
                        <span className="text-[#5c6875]">—</span>
                      )}
                    </td>
                    <td className="text-[#8b98a9]">{r.note}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        ) : (
          <Empty text="该品种暂无敏感度映射" />
        )}
        <div className="mt-1 text-[10px] text-[#5c6875]">
          注：毛利率影响 = −成本占营收比 × 价格涨幅；正值表示毛利率改善（原材料降价）。影响 &gt;3pct 标红。
        </div>
      </Panel>
    </div>
  )
}

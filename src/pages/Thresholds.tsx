import { useMemo, useState } from 'react'
import {
  isConnected,
  evalAnomaly,
  fmtPct,
  fmtPrice,
  type Material,
  type AnomalyEval,
} from '@/lib/data'
import { useAppData } from '@/lib/appData'
import { useThresholds, type ThresholdConfig } from '@/lib/config'
import { Panel, AnomalyBadge, Empty } from '@/components/terminal'

/* 关键词编辑器 */
function KeywordEditor({
  label,
  kws,
  onChange,
  tone,
}: {
  label: string
  kws: string[]
  onChange: (next: string[]) => void
  tone: 'high' | 'mid'
}) {
  const [input, setInput] = useState('')
  const add = () => {
    const k = input.trim()
    if (k && !kws.includes(k)) onChange([...kws, k])
    setInput('')
  }
  const cls =
    tone === 'high'
      ? 'border-[#f23645]/60 bg-[#f23645]/10 text-[#ff8a94]'
      : 'border-[#f0b90b]/60 bg-[#f0b90b]/10 text-[#f0b90b]'
  return (
    <div>
      <div className="mb-1 text-[12px] font-semibold text-[#8b98a9]">{label}</div>
      <div className="flex flex-wrap items-center gap-1">
        {kws.map((k) => (
          <span key={k} className={`flex items-center gap-1 rounded-sm border px-1.5 py-px text-[11px] ${cls}`}>
            {k}
            <button
              onClick={() => onChange(kws.filter((x) => x !== k))}
              className="text-[#7d8a9b] hover:text-white"
              title="删除"
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="新增关键词"
          className="h-6 w-24 rounded-sm border border-[#2a3442] bg-[#0d1117] px-1.5 text-[11px] text-[#d6dee8] outline-none placeholder:text-[#5c6875] focus:border-[#f0b90b]/60"
        />
        <button
          onClick={add}
          className="h-6 rounded-sm border border-[#2a3442] px-2 text-[11px] text-[#8b98a9] hover:border-[#f0b90b]/60 hover:text-[#f0b90b]"
        >
          + 添加
        </button>
      </div>
    </div>
  )
}

const numCls =
  'h-6 w-20 rounded-sm border border-[#2a3442] bg-[#0d1117] px-1.5 text-[12px] num text-[#d6dee8] outline-none focus:border-[#f0b90b]/60'

export default function ThresholdsPage() {
  const { MATERIALS, DATA } = useAppData()
  const { config, defaults, log, save, reset, clearLog } = useThresholds()
  const [draft, setDraft] = useState<ThresholdConfig>(config)
  const [recalc, setRecalc] = useState<{ m: Material; ev: AnomalyEval }[] | null>(null)
  const [saved, setSaved] = useState(false)

  const dirty = JSON.stringify(draft) !== JSON.stringify(config)

  const doSave = () => {
    save(draft)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }
  const doReset = () => {
    reset()
    setDraft(defaults)
  }
  const doRecalc = () => {
    const out = MATERIALS.filter(isConnected)
      .map((m) => ({ m, ev: evalAnomaly(m, draft.anomaly) }))
      .filter(({ ev }) => ev.level)
      .sort((a, b) => (a.ev.level === b.ev.level ? 0 : a.ev.level === '重大异动' ? -1 : 1))
    setRecalc(out)
  }

  const nMajor = useMemo(() => recalc?.filter((r) => r.ev.level === '重大异动').length ?? 0, [recalc])

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
        {/* 异动阈值 */}
        <Panel
          title="异动阈值配置"
          source="本地配置 · localStorage 持久化"
          extra={
            <span className={`text-[11px] ${dirty ? 'text-amber' : 'text-[#5c6875]'}`}>
              {dirty ? '● 有未保存修改' : '已保存'}
            </span>
          }
        >
          <div className="space-y-2.5">
            <div className="grid grid-cols-3 gap-2">
              <label className="text-[12px] text-[#8b98a9]">
                连续周数（规则1）
                <input
                  type="number"
                  min={1}
                  max={10}
                  className={`${numCls} mt-0.5 block w-full`}
                  value={draft.anomaly.streakWeeks}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      anomaly: { ...draft.anomaly, streakWeeks: Number(e.target.value) || 1 },
                    })
                  }
                />
              </label>
              <label className="text-[12px] text-[#8b98a9]">
                波动窗口（周）
                <input
                  type="number"
                  min={2}
                  max={12}
                  className={`${numCls} mt-0.5 block w-full`}
                  value={draft.anomaly.volWindow}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      anomaly: { ...draft.anomaly, volWindow: Number(e.target.value) || 4 },
                    })
                  }
                />
              </label>
              <label className="text-[12px] text-[#8b98a9]">
                波动放大倍数
                <input
                  type="number"
                  min={0.5}
                  max={5}
                  step={0.1}
                  className={`${numCls} mt-0.5 block w-full`}
                  value={draft.anomaly.volMultiplier}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      anomaly: { ...draft.anomaly, volMultiplier: Number(e.target.value) || 1 },
                    })
                  }
                />
              </label>
            </div>
            <div className="rounded border border-[#232b36] bg-[#131922] px-2 py-1.5 text-[11px] leading-relaxed text-[#7d8a9b]">
              <span className="font-semibold text-[#8b98a9]">等级规则：</span>
              规则1 = 连续同向涨跌周数 ≥ 连续周数；规则2 = 本周|周环比| ≥ 前N周均|周环比| × 放大倍数。
              <span className="text-amber"> 重大异动 = 规则1 且 规则2；普通异动 = 规则1 或 规则2。</span>
              <br />
              注：前端重算为预览口径，与数据管道预计算的 anomaly 字段可能存在个别边界差异（如空值周处理）。
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={doSave}
                className="rounded-sm bg-[#f0b90b] px-3 py-1 text-[12px] font-bold text-[#1a1305] hover:bg-[#ffd24a]"
              >
                保存配置
              </button>
              <button
                onClick={doReset}
                className="rounded-sm border border-[#2a3442] px-3 py-1 text-[12px] text-[#8b98a9] hover:border-[#f0b90b]/60 hover:text-[#f0b90b]"
              >
                恢复默认
              </button>
              <button
                onClick={doRecalc}
                className="rounded-sm border border-[#f0b90b]/60 bg-[#f0b90b]/10 px-3 py-1 text-[12px] font-semibold text-[#f0b90b] hover:bg-[#f0b90b]/20"
              >
                ▶ 按当前阈值重算本周异动
              </button>
              {saved && <span className="text-[11px] text-[#089981]">✓ 已保存并留痕</span>}
            </div>
          </div>
        </Panel>

        {/* 公告风险阈值 */}
        <Panel title="公告风险阈值配置" source="本地配置 · 影响驾驶舱雷达">
          <div className="space-y-2.5">
            <KeywordEditor
              label="高风险关键词（每命中 +35 分）"
              kws={draft.announcement.keywordsHigh}
              onChange={(kws) =>
                setDraft({ ...draft, announcement: { ...draft.announcement, keywordsHigh: kws } })
              }
              tone="high"
            />
            <KeywordEditor
              label="中风险关键词（每命中 +15 分）"
              kws={draft.announcement.keywordsMid}
              onChange={(kws) =>
                setDraft({ ...draft, announcement: { ...draft.announcement, keywordsMid: kws } })
              }
              tone="mid"
            />
            <div className="grid grid-cols-3 gap-2">
              <label className="text-[12px] text-[#8b98a9]">
                高风险分值阈值
                <input
                  type="number"
                  className={`${numCls} mt-0.5 block w-full`}
                  value={draft.announcement.scoreHigh}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      announcement: { ...draft.announcement, scoreHigh: Number(e.target.value) || 70 },
                    })
                  }
                />
              </label>
              <label className="text-[12px] text-[#8b98a9]">
                中风险分值阈值
                <input
                  type="number"
                  className={`${numCls} mt-0.5 block w-full`}
                  value={draft.announcement.scoreMid}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      announcement: { ...draft.announcement, scoreMid: Number(e.target.value) || 40 },
                    })
                  }
                />
              </label>
              <label className="text-[12px] text-[#8b98a9]">
                扫描窗口（天）
                <input
                  type="number"
                  className={`${numCls} mt-0.5 block w-full`}
                  value={draft.announcement.scanWindowDays}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      announcement: {
                        ...draft.announcement,
                        scanWindowDays: Number(e.target.value) || 30,
                      },
                    })
                  }
                />
              </label>
            </div>
            <div className="text-[11px] text-[#7d8a9b]">
              风险分 = min(100, 高风险词命中数×35 + 中风险词命中数×15)；得分≥高阈值标红框、≥中阈值标黄框。修改保存后驾驶舱「公告风险雷达」即时生效。
            </div>
          </div>
        </Panel>
      </div>

      {/* 重算预览 */}
      <Panel
        title="本周异动重算预览"
        source={`前端重算 · 基于 materials[].series · 数据周 ${DATA.data_week}`}
        extra={
          recalc && (
            <span className="font-mono text-[11px] text-[#7d8a9b]">
              命中 {recalc.length} 个（重大 {nMajor} / 普通 {recalc.length - nMajor}）
            </span>
          )
        }
        bodyClassName="p-0"
      >
        {!recalc ? (
          <Empty text="点击「按当前阈值重算本周异动」生成预览" />
        ) : recalc.length === 0 ? (
          <Empty text="当前阈值下无品种命中" />
        ) : (
          <div className="overflow-x-auto">
          <table className="dt">
            <thead>
              <tr>
                <th>品种</th>
                <th className="text-right">最新价</th>
                <th className="text-right">本周环比</th>
                <th className="text-right">重算连续周数</th>
                <th className="text-right">前{draft.anomaly.volWindow}周均波动</th>
                <th className="text-center">规则1</th>
                <th className="text-center">规则2</th>
                <th>重算等级</th>
                <th>管道预计算</th>
              </tr>
            </thead>
            <tbody>
              {recalc.map(({ m, ev }) => (
                <tr key={m.id}>
                  <td className="font-semibold text-[#e8eef5]">
                    {m.name}
                    <span className="ml-1 font-mono text-[10px] font-normal text-[#5c6875]">{m.id}</span>
                  </td>
                  <td className="num text-right">
                    {fmtPrice(m.latest?.price)}
                    <span className="ml-0.5 text-[10px] text-[#5c6875]">{m.unit}</span>
                  </td>
                  <td className={`num text-right ${ev.wow! > 0 ? 'text-up' : 'text-down'}`}>
                    {fmtPct(ev.wow)}
                  </td>
                  <td className="num text-right">{ev.streak}</td>
                  <td className="num text-right text-[#8b98a9]">
                    {ev.refVol != null ? `${ev.refVol.toFixed(2)}%` : '—'}
                  </td>
                  <td className="text-center">{ev.rule1 ? '✓' : '—'}</td>
                  <td className="text-center">{ev.rule2 ? '✓' : '—'}</td>
                  <td>
                    <AnomalyBadge level={ev.level} />
                  </td>
                  <td className="text-[#8b98a9]">
                    {m.latest?.anomaly || '—'}
                    {(m.latest?.anomaly || '') !== ev.level && (
                      <span className="ml-1 text-amber" title="与管道口径不一致（边界差异）">≠</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </Panel>

      {/* 变更留痕 */}
      <Panel
        title="阈值变更留痕"
        source="localStorage · 本地审计"
        extra={
          <button
            onClick={clearLog}
            className="text-[11px] text-[#5c6875] hover:text-[#f23645]"
          >
            清空留痕
          </button>
        }
        bodyClassName="p-0"
      >
        {!log.length ? (
          <Empty text="暂无变更记录（保存配置后自动留痕）" />
        ) : (
          <table className="dt">
            <thead>
              <tr>
                <th className="w-44">时间</th>
                <th>变更内容</th>
              </tr>
            </thead>
            <tbody>
              {log.map((e, i) => (
                <tr key={i}>
                  <td className="num text-[#8b98a9]">{e.time}</td>
                  <td className="text-[#c8d2de]">{e.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  )
}

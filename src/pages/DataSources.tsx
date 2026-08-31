import { useEffect, useState } from 'react'
import {
  isConnected,
  IMPORT_DEPENDENT,
  type PipelineStep,
} from '@/lib/data'
import { useAppData } from '@/lib/appData'
import { SITE } from '@/config'
import { Panel, ExpBadge, CompanyLink } from '@/components/terminal'

/* ============ 管线运行日志 ============ */
interface RunLog {
  run_at?: string
  steps?: PipelineStep[]
}

const stepBadge = (s: string) =>
  s === 'ok'
    ? 'bg-[#089981]/20 text-[#089981]'
    : s === 'partial'
      ? 'bg-[#f0b90b]/15 text-[#f0b90b]'
      : 'bg-[#f23645]/15 text-[#f23645]'

function PipelineLogCard() {
  const { DATA } = useAppData()
  const [log, setLog] = useState<RunLog | null>(null)
  const [logMissing, setLogMissing] = useState(false)

  // run_log.json 由管线在采集日生成；未运行前可能 404，容忍
  useEffect(() => {
    let alive = true
    fetch('data/run_log.json')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<RunLog>
      })
      .then((d) => alive && setLog(d))
      .catch(() => alive && setLogMissing(true))
    return () => {
      alive = false
    }
  }, [])

  const p = DATA.pipeline
  const lastRun = log?.run_at ?? p?.last_run ?? null
  const steps = log?.steps?.length ? log.steps : (p?.steps ?? [])

  return (
    <Panel
      title="管线运行日志"
      source={`${p?.mode ?? 'github-actions-cron'} · ${p?.schedule ?? SITE.updateNote}`}
      extra={
        <span className="font-mono text-[10px] text-[#7d8a9b]">
          最近运行：{lastRun ? new Date(lastRun).toLocaleString('zh-CN', { hour12: false }) : '暂无记录'}
        </span>
      }
    >
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-0.5 font-mono text-[11px] text-[#8b98a9]">
        <span>
          运行模式 <span className="text-[#d6dee8]">{p?.mode ?? 'github-actions-cron'}</span>
        </span>
        <span>
          调度 <span className="text-[#d6dee8]">{p?.schedule ?? SITE.updateNote}</span>
        </span>
        <span>
          数据周 <span className="text-amber">{DATA.data_week}</span>
        </span>
      </div>
      {steps.length > 0 ? (
        <div className="space-y-1">
          {steps.map((s, i) => (
            <div
              key={i}
              className="flex flex-wrap items-center gap-2 rounded-sm border border-[#232b36] bg-[#131922] px-2 py-1 text-[11.5px]"
            >
              <span className={`rounded-sm px-1.5 py-px font-mono font-bold ${stepBadge(s.status)}`}>
                {s.status}
              </span>
              <span className="font-semibold text-[#d6dee8]">{s.step}</span>
              {s.detail && <span className="text-[#7d8a9b]">{s.detail}</span>}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded border border-dashed border-[#3a4657] bg-[#131922] px-3 py-3 text-[11.5px] leading-relaxed text-[#7d8a9b]">
          暂无运行步骤记录。
          {logMissing && (
            <span className="text-[#5c6875]">
              （data/run_log.json 未找到 —— 管线尚未产出运行日志，下一次 GitHub Actions
              每交易日 16:30 自动运行后生成）
            </span>
          )}
        </div>
      )}
    </Panel>
  )
}

/* 数据源状态颜色 */
function statusBadge(s: string) {
  let cls = 'bg-[#5c6875] text-white' // 待采购 灰
  if (s.startsWith('可用')) cls = 'bg-[#089981] text-white'
  else if (s.startsWith('备用')) cls = 'bg-[#f0b90b] text-[#1a1305]'
  else if (s.startsWith('不可用')) cls = 'bg-[#f23645] text-white'
  else if (s.startsWith('待接入')) cls = 'bg-[#4aa3ff] text-[#0d1117]'
  return <span className={`inline-block rounded-sm px-1.5 py-px text-[11px] font-bold ${cls}`}>{s}</span>
}

/* 口径字典（dim_caliber，13条） */
const CALIBER_DICT: [string, string, string][] = [
  ['spot_price', '现货价', '生意社现货评估价（对应期货标的现货），与期货存在基差'],
  ['iso_week', '数据周', 'ISO-8601 周口径，如 2026-W35；周聚合取该周最后一个交易日'],
  ['wow_pct', '周环比%', '(本周价/上周价−1)×100；首周无上周基准为 null'],
  ['streak', '连续涨跌周数', '连续同向周数，涨为正/跌为负；本周走平或反向则重置'],
  ['absvol4', '前4周均波动', '|wow_pct| 的前4周算术均值，衡量常态波动水平'],
  ['anomaly_rule1', '异动规则1（趋势）', '|streak| ≥ 连续周数阈值（默认3周）'],
  ['anomaly_rule2', '异动规则2（波动放大）', '本周|wow_pct| ≥ 前N周均波动 × 放大倍数（默认4周×1.0）'],
  ['level_major', '重大异动', '规则1 且 规则2 同时满足'],
  ['level_normal', '普通异动', '规则1 或 规则2 满足其一'],
  ['adj_kline', '复权口径', '公司K线为前复权日频（新浪 stock_zh_a_daily / stock_hk_daily）'],
  ['snapshot_pe', '估值口径', 'PE 为 TTM 口径；市值为最新收盘价 × 总股本'],
  ['cost_ratio', '成本占营收比', '分析师经验假设 v1（待年报校准），仅用于相对比较与压力测试'],
  ['risk_score', '公告风险分', 'min(100, 高风险词×35 + 中风险词×15)；≥70 红框 / ≥40 黄框（可调）'],
]

export default function DataSourcesPage() {
  const { DATA, MATERIALS } = useAppData()
  const connected = MATERIALS.filter(isConnected)
  const pending = MATERIALS.filter((m) => !isConnected(m))
  const pct = Math.round((connected.length / MATERIALS.length) * 100)

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
        {/* 数据源登记表 */}
        <Panel
          title={`数据源登记表（${DATA.data_sources.length} 个）`}
          source={`登记表 · 更新 ${DATA.generated_at}`}
          bodyClassName="p-0"
        >
          <div className="overflow-x-auto">
          <table className="dt">
            <thead>
              <tr>
                <th>数据源</th>
                <th>类型</th>
                <th>状态</th>
                <th>频率</th>
                <th>覆盖</th>
                <th>备注</th>
              </tr>
            </thead>
            <tbody>
              {DATA.data_sources.map((s) => (
                <tr key={s.name}>
                  <td className="max-w-56">
                    <div className="text-[#d6dee8]">{s.name}</div>
                  </td>
                  <td className="whitespace-nowrap text-[#8b98a9]">{s.type}</td>
                  <td className="whitespace-nowrap">{statusBadge(s.status)}</td>
                  <td className="whitespace-nowrap num text-[#8b98a9]">{s.freq}</td>
                  <td className="max-w-44 text-[11px] text-[#8b98a9]">{s.items}</td>
                  <td className="max-w-52 text-[11px] text-[#7d8a9b]">{s.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </Panel>

        {/* 数据可得性看板 */}
        <div className="space-y-2">
          <Panel
            title="数据可得性看板"
            source={`覆盖统计 · 数据周 ${DATA.data_week}`}
          >
            <div className="mb-1 flex items-end justify-between">
              <div className="num text-[24px] font-bold text-[#e8eef5]">
                {connected.length}
                <span className="text-[13px] font-normal text-[#7d8a9b]"> / {MATERIALS.length} 品种已接入</span>
              </div>
              <div className="num text-[13px] text-amber">{pending.length} 个待采购</div>
            </div>
            <div className="flex h-4 overflow-hidden rounded-sm border border-[#2a3442] bg-[#131922]">
              <div
                className="flex items-center justify-center bg-[#089981] text-[10px] font-bold text-white"
                style={{ width: `${pct}%` }}
              >
                {pct}%
              </div>
              <div className="flex flex-1 items-center justify-center bg-[#3a4657]/60 text-[10px] text-[#c8d2de]">
                待采购 {100 - pct}%
              </div>
            </div>
            <div className="mt-1 text-[10px] text-[#5c6875]">
              已接入 {connected.length}：{connected.map((m) => m.id).join(' / ')}
            </div>
          </Panel>

          {/* 待采购清单 */}
          <Panel
            title={`待采购品种清单（${pending.length} 个 · 数据源采购预算依据）`}
            source="采购建议 · 人工维护"
            bodyClassName="p-0"
          >
            <div className="max-h-[380px] overflow-y-auto">
              <table className="dt">
                <thead>
                  <tr>
                    <th>品种</th>
                    <th>类别</th>
                    <th>建议采购源</th>
                    <th>频率</th>
                    <th>标签</th>
                    <th>下游映射</th>
                  </tr>
                </thead>
                <tbody>
                  {pending.map((m) => (
                    <tr key={m.id}>
                      <td className="whitespace-nowrap">
                        <span className="font-semibold text-[#e8eef5]">{m.name}</span>
                        <span className="ml-1 font-mono text-[10px] text-[#5c6875]">{m.id}</span>
                      </td>
                      <td className="whitespace-nowrap text-[#8b98a9]">{m.category}</td>
                      <td className="max-w-52 text-[11px] text-[#d6dee8]">{m.source}</td>
                      <td className="num whitespace-nowrap text-[#8b98a9]">{m.freq}</td>
                      <td className="whitespace-nowrap">
                        {IMPORT_DEPENDENT.has(m.id) && (
                          <span className="tag-import">进口依赖·汇率敏感</span>
                        )}
                      </td>
                      <td className="max-w-64">
                        <div className="flex flex-wrap gap-x-1.5 gap-y-0.5">
                          {(m.downstream ?? []).slice(0, 6).map((d) => (
                            <span key={d.code} className="flex items-center gap-0.5 text-[11px]">
                              <ExpBadge level={d.level} />
                              <CompanyLink code={d.code} name={d.name} />
                            </span>
                          ))}
                          {(m.downstream?.length ?? 0) > 6 && (
                            <span className="text-[10px] text-[#5c6875]">
                              +{m.downstream.length - 6}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      </div>

      {/* 管线运行日志 */}
      <PipelineLogCard />

      {/* 口径字典 */}
      <Panel title="口径字典（dim_caliber）" source="数据字典 v1 · 口径透明硬性要求" bodyClassName="p-0">
        <div className="overflow-x-auto">
        <table className="dt">
          <thead>
            <tr>
              <th className="w-36">字段</th>
              <th className="w-40">名称</th>
              <th>定义 / 口径说明</th>
            </tr>
          </thead>
          <tbody>
            {CALIBER_DICT.map(([f, n, d]) => (
              <tr key={f}>
                <td className="num text-amber">{f}</td>
                <td className="text-[#d6dee8]">{n}</td>
                <td className="text-[#8b98a9]">{d}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </Panel>

      {/* 测试问题记录 */}
      <Panel
        title={`测试问题记录（${DATA.test_log.length} 条 · 团队协作测试留痕）`}
        source={`test_log · 更新 ${DATA.generated_at}`}
        bodyClassName="p-0"
      >
        <div className="overflow-x-auto">
        <table className="dt">
          <thead>
            <tr>
              <th>ID</th>
              <th>模块</th>
              <th>问题</th>
              <th>结果</th>
              <th>状态</th>
              <th>日期</th>
            </tr>
          </thead>
          <tbody>
            {DATA.test_log.map((t) => (
              <tr key={t.id}>
                <td className="num font-bold text-amber">{t.id}</td>
                <td className="whitespace-nowrap text-[#d6dee8]">{t.module}</td>
                <td className="max-w-72 text-[#8b98a9]">{t.issue}</td>
                <td className="max-w-72 text-[#8b98a9]">{t.result}</td>
                <td className="whitespace-nowrap">
                  <span
                    className={`rounded-sm px-1.5 py-px text-[11px] font-bold ${
                      t.status.startsWith('已解决')
                        ? 'bg-[#089981]/20 text-[#089981]'
                        : t.status.includes('转采购') || t.status.includes('降级')
                          ? 'bg-[#f0b90b]/15 text-[#f0b90b]'
                          : 'bg-[#f23645]/15 text-[#f23645]'
                    }`}
                  >
                    {t.status}
                  </span>
                </td>
                <td className="num text-[#8b98a9]">{t.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </Panel>
    </div>
  )
}

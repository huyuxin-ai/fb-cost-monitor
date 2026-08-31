import { useEffect, useRef } from 'react'
import * as echarts from 'echarts'
import type { EChartsCoreOption } from 'echarts/core'

interface Props {
  option: EChartsCoreOption
  height?: number | string
  className?: string
}

export default function EChart({ option, height = 260, className }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    if (!ref.current) return
    const chart = echarts.init(ref.current, undefined, { renderer: 'canvas' })
    chartRef.current = chart
    const ro = new ResizeObserver(() => chart.resize())
    ro.observe(ref.current)
    return () => {
      ro.disconnect()
      chart.dispose()
      chartRef.current = null
    }
  }, [])

  useEffect(() => {
    chartRef.current?.setOption(option, { notMerge: true })
  }, [option])

  return <div ref={ref} className={className} style={{ height, width: '100%' }} />
}

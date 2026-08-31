/** K线大数据文件（2.9MB）—— 首次进入K线页时 lazy fetch 并缓存到内存 */
export interface KlinePoint {
  date: string
  open: number
  close: number
  high: number
  low: number
  volume: number
  pct: number | null
}

export interface KlineEntry {
  name: string
  data: KlinePoint[]
}

export type KlineData = Record<string, KlineEntry>

let cache: Promise<KlineData> | null = null

export function loadKline(): Promise<KlineData> {
  if (!cache) {
    // 相对路径：兼容 GitHub Pages 子路径部署
    cache = fetch('data/kline.json')
      .then((r) => {
        if (!r.ok) throw new Error(`kline.json 加载失败: HTTP ${r.status}`)
        return r.text()
      })
      .then((text) => {
        // 源文件含 NaN / Infinity 字面量（非标准JSON），清洗为 null 后解析
        const cleaned = text
          .replace(/:\s*NaN/g, ': null')
          .replace(/:\s*-?Infinity/g, ': null')
        return JSON.parse(cleaned) as KlineData
      })
  }
  return cache
}

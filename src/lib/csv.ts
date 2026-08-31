/** CSV 导出（带 BOM，Excel 打开中文不乱码） */

type Cell = string | number | null | undefined

function esc(v: Cell): string {
  if (v == null) return ''
  const s = String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function downloadCsv(filename: string, header: Cell[], rows: Cell[][]) {
  const lines = [header, ...rows].map((r) => r.map(esc).join(','))
  // \ufeff BOM 头：保证 utf-8 中文在 Excel 中正确识别
  const blob = new Blob(['\ufeff' + lines.join('\r\n')], {
    type: 'text/csv;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

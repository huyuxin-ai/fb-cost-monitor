/** 站点级常量（独立站配置，无环境耦合） */
export const SITE = {
  /** 站点短名 */
  name: '食饮成本监控终端',
  /** 站点全名 */
  fullName: '食品饮料原材料成本监控终端',
  /** 英文副标题 */
  subtitle: 'F&B RAW MATERIAL COST MONITOR',
  version: 'v2.0',
  /** 数据自动更新说明 */
  updateNote: '每交易日16:30自动更新',
  /** 仓库托管说明（页脚） */
  hosting: 'GitHub Pages · Actions 每日重建数据',
} as const

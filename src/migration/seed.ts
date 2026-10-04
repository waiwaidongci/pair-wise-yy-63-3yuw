import type { EngineToken, Product } from './engine';

// 下线颜色令牌的种子：旧名称混入四个产品，引用链覆盖
// 基础色 → 语义令牌 → 组件别名 → 产品根引用。

export const seedMigrationTokens: EngineToken[] = [
  // —— 基础色 ——
  {
    id: 'color.base.blue.600', name: '品牌主色 600', category: 'color', value: '#2864dc',
    themes: { light: '#2864dc', dark: '#6f96ff', ops: '#24786a', contrast: '#0b4dba' },
    usage: 184, status: 'stable', description: '主操作、链接和重点状态（旧版品牌色，仍被旧引用使用）'
  },
  {
    id: 'color.base.brand.600', name: '品牌主色 600 · 新版', category: 'color', value: '#2f63d4',
    themes: { light: '#2f63d4', dark: '#7aa0ff', ops: '#1f7a68', contrast: '#0840a8' },
    usage: 34, status: 'stable', description: '品牌体系收敛后的新版主色，旧品牌色的替代令牌'
  },
  {
    id: 'color.base.blue.400', name: '品牌蓝 400', category: 'color', value: '#6f96ff',
    themes: { light: '#6f96ff', dark: '#6f96ff', ops: '#58a99a', contrast: '#2878e8' },
    usage: 42, status: 'stable', description: '暗色主题主色'
  },
  {
    id: 'color.base.blue.800', name: '品牌蓝 800', category: 'color', value: '#0b4dba',
    themes: { light: '#0b4dba', dark: '#9ab9ff', ops: '#145c51', contrast: '#06358a' },
    usage: 31, status: 'stable', description: '高对比主题主色'
  },
  {
    id: 'color.base.green.600', name: '运营绿 600', category: 'color', value: '#24786a',
    themes: { light: '#24786a', dark: '#54b2a0', ops: '#24786a', contrast: '#0d5a4d' },
    usage: 67, status: 'proposed', description: '运营产品品牌替换色'
  },
  {
    id: 'color.text.primary', name: '正文主色', category: 'color', value: '#17202b',
    themes: { light: '#17202b', dark: '#f5f7fa', ops: '#152a25', contrast: '#000000' },
    usage: 293, status: 'stable', description: '主要正文和标题'
  },
  {
    id: 'color.text.secondary', name: '正文次色', category: 'color', value: '#667582',
    themes: { light: '#667582', dark: '#a8b2bd', ops: '#62766f', contrast: '#303b46' },
    usage: 211, status: 'stable', description: '辅助信息和说明'
  },
  {
    id: 'color.surface.canvas', name: '页面背景', category: 'color', value: '#f2f5f7',
    themes: { light: '#f2f5f7', dark: '#121821', ops: '#f1f6f4', contrast: '#ffffff' },
    usage: 54, status: 'stable', description: '应用一级背景（对比度门禁基准）'
  },

  // —— 待下线旧名称（deprecated）——
  {
    id: 'color.deprecated.brand', name: '旧·品牌主色（下线）', category: 'color', value: '#2b5fd9',
    themes: { light: '#2b5fd9', dark: '#7b9dff', ops: '#277a6a', contrast: '#0a45b0' },
    usage: 96, status: 'deprecated', description: '旧命名体系的品牌色，下线后由 color.semantic.primary 承接'
  },
  {
    id: 'color.deprecated.accent', name: '旧·强调青（下线）', category: 'color', value: '#4d96ff',
    themes: { light: '#4d96ff', dark: '#8fb4ff', ops: '#3a8f7c', contrast: '#1a5fd0' },
    usage: 58, status: 'deprecated', description: '旧运营强调色，替代关系登记为一个亮色不达标颜色（门禁暂停示例）'
  },
  {
    id: 'color.base.teal.400', name: '青绿 400', category: 'color', value: '#54b2a0',
    themes: { light: '#9fc7c0', dark: '#54b2a0', ops: '#24786a', contrast: '#0d5a4d' },
    usage: 12, status: 'stable', description: '强调青的候选替代；明亮模式对比度过低，会被门禁拦截'
  },

  // —— 语义层 ——
  {
    id: 'color.semantic.primary', name: '语义主色', category: 'color', value: '{color.deprecated.brand}',
    ref: 'color.deprecated.brand',
    themes: {
      light: '{color.deprecated.brand}', dark: '{color.base.blue.400}',
      ops: '{color.base.green.600}', contrast: '{color.base.blue.800}'
    },
    usage: 126, status: 'stable', description: '组件库统一主色别名（明亮模式仍指向下线旧色）'
  },
  {
    id: 'color.semantic.accent', name: '语义强调色', category: 'color', value: '{color.deprecated.accent}',
    ref: 'color.deprecated.accent',
    themes: {
      light: '{color.deprecated.accent}', dark: '{color.deprecated.accent}',
      ops: '{color.deprecated.accent}', contrast: '{color.base.blue.800}'
    },
    usage: 61, status: 'stable', description: '运营活动与高亮元素别名'
  },

  // —— 组件别名 ——
  {
    id: 'component.button.primary.bg', name: '主按钮背景', category: 'component',
    value: '{color.semantic.primary}', ref: 'color.semantic.primary',
    themes: {
      light: '{color.semantic.primary}', dark: '{color.semantic.primary}',
      ops: '{color.semantic.primary}', contrast: '{color.semantic.primary}'
    },
    usage: 98, status: 'stable', description: '主要操作按钮'
  },
  {
    id: 'component.button.primary.text', name: '主按钮文字', category: 'component', value: '#ffffff',
    themes: { light: '#ffffff', dark: '#ffffff', ops: '#ffffff', contrast: '#ffffff' },
    usage: 98, status: 'stable', description: '主要操作按钮文字'
  },
  {
    id: 'component.banner.accent.bg', name: '活动横幅底色', category: 'component',
    value: '{color.semantic.accent}', ref: 'color.semantic.accent',
    themes: {
      light: '{color.semantic.accent}', dark: '{color.semantic.accent}',
      ops: '{color.semantic.accent}', contrast: '{color.semantic.accent}'
    },
    usage: 44, status: 'stable', description: '运营活动横幅与标签底色'
  },

  // —— 非颜色（类型不一致示例）——
  {
    id: 'shadow.raised', name: '浮层阴影', category: 'shadow',
    value: '0 8px 28px rgba(22,35,48,.14)',
    themes: {
      light: '0 8px 28px rgba(22,35,48,.14)', dark: '0 8px 28px rgba(0,0,0,.42)',
      ops: '0 8px 28px rgba(21,54,45,.14)', contrast: '0 0 0 2px #303b46'
    },
    usage: 36, status: 'stable', description: '菜单、弹窗和浮层'
  }
];

/** 旧稿兼容：下线令牌的原始字面量，替代关系缺环时按原值读取 */
export const seedLegacyLiterals: Record<string, Record<string, string>> = {
  'color.deprecated.brand': { light: '#2b5fd9', dark: '#7b9dff', ops: '#277a6a', contrast: '#0a45b0' },
  'color.deprecated.accent': { light: '#4d96ff', dark: '#8fb4ff', ops: '#3a8f7c', contrast: '#1a5fd0' },
  'color.legacy.unmapped': { light: '#8a5cf6', dark: '#a982ff', ops: '#7a4fe0', contrast: '#5d2fd0' }
};

export const seedProducts: Product[] = [
  {
    id: 'p-web',
    name: '官网门户',
    themes: ['light', 'dark'],
    refs: {
      light: ['component.button.primary.bg', 'component.banner.accent.bg', 'color.text.primary'],
      dark: ['component.button.primary.bg', 'component.banner.accent.bg', 'color.text.secondary']
    },
    rewrites: []
  },
  {
    id: 'p-ops',
    name: '运营后台',
    themes: ['light', 'ops'],
    refs: {
      light: ['component.button.primary.bg', 'component.banner.accent.bg', 'color.deprecated.brand'],
      ops: ['component.button.primary.bg', 'component.banner.accent.bg']
    },
    rewrites: []
  },
  {
    id: 'p-mobile',
    name: '移动端 App',
    themes: ['light', 'dark'],
    refs: {
      light: ['component.button.primary.bg', 'color.deprecated.accent'],
      dark: ['component.button.primary.bg']
    },
    rewrites: []
  },
  {
    id: 'p-data',
    name: '数据大屏',
    themes: ['dark', 'contrast'],
    refs: {
      dark: ['component.button.primary.bg', 'component.banner.accent.bg'],
      contrast: ['component.button.primary.bg', 'component.banner.accent.bg']
    },
    rewrites: []
  }
];

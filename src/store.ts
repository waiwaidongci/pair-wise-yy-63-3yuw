import { defineStore } from 'pinia';

export type TokenCategory = 'color' | 'font' | 'spacing' | 'radius' | 'shadow' | 'component';
export type Token = {
  id: string;
  name: string;
  category: TokenCategory;
  value: string;
  ref?: string;
  themes: Record<string, string>;
  usage: number;
  status: 'stable' | 'deprecated' | 'proposed';
  description: string;
};

export type ChangeRequest = {
  id: string;
  title: string;
  requester: string;
  scope: string;
  impact: number;
  status: '待评审' | '已接受' | '已退回';
  diff: { token: string; before: string; after: string };
};

export type Product = { id: string; name: string };

export type MigrationStatus = '待校验' | '可处理' | '已暂停' | '已落定' | '待确认';
export type PauseReason = '缺环' | '类型不一致' | '对比度不达标';
export type MigrationMapping = {
  id: string;
  batchId: string;
  oldTokenId: string;
  newTokenId: string;
  scope: { productIds: string[]; themes: string[] };
  status: MigrationStatus;
  pauseReason?: PauseReason;
  pauseDetail?: string;
  settledAt?: number;
};
export type MigrationBatch = {
  id: string;
  title: string;
  createdAt: number;
  baseVersion: number;
  mappings: MigrationMapping[];
  status: '草稿' | '已校验' | '部分落定' | '已全部落定' | '已回滚' | '待确认';
};

const initialTokens: Token[] = [
  { id: 'color.base.blue.600', name: '品牌主色 600', category: 'color', value: '#2864dc', themes: { light: '#2864dc', dark: '#6f96ff', ops: '#24786a', contrast: '#0b4dba' }, usage: 184, status: 'stable', description: '主操作、链接和重点状态' },
  { id: 'color.semantic.primary', name: '语义主色', category: 'color', value: '{color.base.blue.600}', ref: 'color.base.blue.600', themes: { light: '{color.base.blue.600}', dark: '{color.base.blue.400}', ops: '{color.base.green.600}', contrast: '{color.base.blue.800}' }, usage: 126, status: 'stable', description: '组件库统一主色别名' },
  { id: 'color.base.blue.400', name: '品牌蓝 400', category: 'color', value: '#6f96ff', themes: { light: '#6f96ff', dark: '#6f96ff', ops: '#58a99a', contrast: '#2878e8' }, usage: 42, status: 'stable', description: '暗色主题主色' },
  { id: 'color.base.blue.800', name: '品牌蓝 800', category: 'color', value: '#0b4dba', themes: { light: '#0b4dba', dark: '#9ab9ff', ops: '#145c51', contrast: '#06358a' }, usage: 31, status: 'stable', description: '高对比主题主色' },
  { id: 'color.base.green.600', name: '运营绿 600', category: 'color', value: '#24786a', themes: { light: '#24786a', dark: '#54b2a0', ops: '#24786a', contrast: '#0d5a4d' }, usage: 67, status: 'proposed', description: '运营产品品牌替换色' },
  { id: 'color.text.primary', name: '正文主色', category: 'color', value: '#17202b', themes: { light: '#17202b', dark: '#f5f7fa', ops: '#152a25', contrast: '#000000' }, usage: 293, status: 'stable', description: '主要正文和标题' },
  { id: 'color.text.secondary', name: '正文次色', category: 'color', value: '#667582', themes: { light: '#667582', dark: '#a8b2bd', ops: '#62766f', contrast: '#303b46' }, usage: 211, status: 'stable', description: '辅助信息和说明' },
  { id: 'color.surface.canvas', name: '页面背景', category: 'color', value: '#f2f5f7', themes: { light: '#f2f5f7', dark: '#121821', ops: '#f1f6f4', contrast: '#ffffff' }, usage: 54, status: 'stable', description: '应用一级背景' },
  { id: 'font.family.sans', name: '无衬线字体', category: 'font', value: '"Noto Sans SC", sans-serif', themes: { light: '"Noto Sans SC", sans-serif', dark: '"Noto Sans SC", sans-serif', ops: '"Noto Sans SC", sans-serif', contrast: 'system-ui, sans-serif' }, usage: 388, status: 'stable', description: '产品界面默认真体' },
  { id: 'font.size.body', name: '正文字号', category: 'font', value: '14px', themes: { light: '14px', dark: '14px', ops: '14px', contrast: '16px' }, usage: 255, status: 'stable', description: '正文与表单文本' },
  { id: 'spacing.base.2', name: '基础间距 2', category: 'spacing', value: '8px', themes: { light: '8px', dark: '8px', ops: '8px', contrast: '8px' }, usage: 312, status: 'stable', description: '紧凑布局基础间距' },
  { id: 'radius.control', name: '控件圆角', category: 'radius', value: '6px', themes: { light: '6px', dark: '6px', ops: '4px', contrast: '4px' }, usage: 167, status: 'stable', description: '按钮、输入框和卡片' },
  { id: 'shadow.raised', name: '浮层阴影', category: 'shadow', value: '0 8px 28px rgba(22,35,48,.14)', themes: { light: '0 8px 28px rgba(22,35,48,.14)', dark: '0 8px 28px rgba(0,0,0,.42)', ops: '0 8px 28px rgba(21,54,45,.14)', contrast: '0 0 0 2px #303b46' }, usage: 36, status: 'stable', description: '菜单、弹窗和浮层' },
  { id: 'component.button.primary.bg', name: '主按钮背景', category: 'component', value: '{color.semantic.primary}', ref: 'color.semantic.primary', themes: { light: '{color.semantic.primary}', dark: '{color.semantic.primary}', ops: '{color.semantic.primary}', contrast: '{color.semantic.primary}' }, usage: 98, status: 'stable', description: '主要操作按钮' },
  { id: 'component.button.primary.text', name: '主按钮文字', category: 'component', value: '#ffffff', themes: { light: '#ffffff', dark: '#ffffff', ops: '#ffffff', contrast: '#ffffff' }, usage: 98, status: 'stable', description: '主要操作按钮文字' }
];

const changes: ChangeRequest[] = [
  { id: 'CR-412', title: '运营产品切换语义主色', requester: '运营设计组', scope: '4 个产品 · 238 处引用', impact: 86, status: '待评审', diff: { token: 'color.semantic.primary', before: '{color.base.blue.600}', after: '{color.base.green.600}' } },
  { id: 'CR-418', title: '高对比度正文尺寸调整', requester: '无障碍专项组', scope: '2 个产品 · 74 处引用', impact: 42, status: '待评审', diff: { token: 'font.size.body', before: '14px', after: '16px' } },
  { id: 'CR-423', title: '统一浮层圆角', requester: '组件维护组', scope: '12 个组件 · 36 处引用', impact: 28, status: '待评审', diff: { token: 'radius.control', before: '8px', after: '6px' } }
];

const products: Product[] = [
  { id: 'component-library', name: '组件库' },
  { id: 'ops-admin', name: '运营后台' },
  { id: 'mobile', name: '移动端组件' },
  { id: 'data-platform', name: '数据平台' }
];

const productUsage: Record<string, string[]> = {
  'component-library': ['color.base.blue.600', 'color.semantic.primary', 'color.text.primary', 'color.surface.canvas', 'font.family.sans', 'font.size.body', 'radius.control', 'component.button.primary.bg', 'component.button.primary.text'],
  'ops-admin': ['color.semantic.primary', 'color.base.green.600', 'color.text.primary', 'color.surface.canvas', 'font.size.body', 'spacing.base.2', 'radius.control', 'shadow.raised'],
  'mobile': ['color.semantic.primary', 'color.base.blue.400', 'color.text.primary', 'color.text.secondary', 'font.size.body', 'radius.control', 'component.button.primary.bg'],
  'data-platform': ['color.base.blue.800', 'color.text.primary', 'color.text.secondary', 'color.surface.canvas', 'spacing.base.2', 'shadow.raised', 'font.family.sans']
};

const storageKey = 'yy63-token-governance';
const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(storageKey) : null;
const saved = raw ? JSON.parse(raw) : null;

const defaultThemes = ['light', 'dark', 'ops', 'contrast'];

function cloneTokens(tokens: Token[]): Token[] {
  return JSON.parse(JSON.stringify(tokens)) as Token[];
}

function chainThemeRef(tokens: Token[], tokenId: string, theme: string, seen: Set<string> = new Set()): string[] {
  if (seen.has(tokenId)) return [];
  seen.add(tokenId);
  const token = tokens.find((item) => item.id === tokenId);
  if (!token) return [];
  const value = token.themes[theme];
  if (value && value.startsWith('{') && value.endsWith('}')) {
    return [tokenId, ...chainThemeRef(tokens, value.slice(1, -1), theme, seen)];
  }
  return [tokenId];
}

function terminalThemeValue(tokens: Token[], tokenId: string, theme: string, seen: Set<string> = new Set()): string | null {
  if (seen.has(tokenId)) return null;
  seen.add(tokenId);
  const token = tokens.find((item) => item.id === tokenId);
  if (!token) return null;
  const value = token.themes[theme];
  if (value && value.startsWith('{') && value.endsWith('}')) {
    return terminalThemeValue(tokens, value.slice(1, -1), theme, seen);
  }
  return value ?? token.value;
}

function hexContrastRatio(a: string, b: string): number {
  const clean = (hex: string) => hex.replace('#', '');
  const parse = (hex: string): [number, number, number] | null => {
    const c = clean(hex);
    if (c.length !== 6) return null;
    const channels = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16));
    if (channels.some((n) => Number.isNaN(n))) return null;
    return channels.map((n) => n / 255) as [number, number, number];
  };
  const luminance = (rgb: [number, number, number]) => {
    const [r, g, b] = rgb.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ca = parse(a);
  const cb = parse(b);
  if (!ca || !cb) return 0;
  const la = luminance(ca);
  const lb = luminance(cb);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function makeMapping(batchId: string, oldTokenId: string, newTokenId: string, scope: { productIds: string[]; themes: string[] }): MigrationMapping {
  return {
    id: `MM-${Math.random().toString(36).slice(2, 8)}`,
    batchId,
    oldTokenId,
    newTokenId,
    scope,
    status: '待校验'
  };
}

function seedMigrationBatch(): MigrationBatch {
  const batchId = 'MB-SEED-01';
  const scope = { productIds: ['component-library', 'ops-admin', 'mobile'], themes: defaultThemes };
  const m1 = makeMapping(batchId, 'color.base.blue.600', 'color.base.blue.800', scope);
  m1.status = '可处理';
  const m2 = makeMapping(batchId, 'color.base.blue.400', 'color.base.blue.500', scope);
  m2.status = '已暂停';
  m2.pauseReason = '缺环';
  m2.pauseDetail = '替代令牌 color.base.blue.500 不存在，引用链断裂';
  const m3 = makeMapping(batchId, 'color.text.secondary', 'font.size.body', scope);
  m3.status = '已暂停';
  m3.pauseReason = '类型不一致';
  m3.pauseDetail = '类型不一致：color → font';
  const m4 = makeMapping(batchId, 'color.base.green.600', 'color.base.blue.400', scope);
  m4.status = '已暂停';
  m4.pauseReason = '对比度不达标';
  const ratio = hexContrastRatio('#6f96ff', '#f2f5f7');
  m4.pauseDetail = `替代色在 light 主题下与背景对比度 ${ratio.toFixed(2)}:1，低于 4.5:1`;
  return { id: batchId, title: '下线旧品牌色（预登记）', createdAt: Date.now(), baseVersion: 0, mappings: [m1, m2, m3, m4], status: '已校验' };
}

export const useTokenStore = defineStore('tokens', {
  state: () => ({
    tokens: (saved?.tokens as Token[]) ?? initialTokens,
    changes: (saved?.changes as ChangeRequest[]) ?? changes,
    products: (saved?.products as Product[]) ?? products,
    productUsage: (saved?.productUsage as Record<string, string[]>) ?? productUsage,
    migrationBatches: (saved?.migrationBatches as MigrationBatch[]) ?? [seedMigrationBatch()],
    pendingConfirmations: (saved?.pendingConfirmations as MigrationMapping[]) ?? [],
    migrationVersion: (saved?.migrationVersion as number) ?? 0,
    migrationLocked: false,
    selectedBatchId: (saved?.selectedBatchId as string) ?? 'MB-SEED-01',
    publishSnapshot: cloneTokens((saved?.publishSnapshot as Token[] | undefined) ?? initialTokens),
    activeTheme: (saved?.activeTheme as string) ?? 'light',
    selectedTokenId: (saved?.selectedTokenId as string) ?? 'color.semantic.primary',
    search: (saved?.search as string) ?? '',
    category: (saved?.category as string) ?? '全部',
    releaseVersion: '4.6.0-rc.2',
    locked: (saved?.locked as boolean) ?? false,
    lastPublished: (saved?.lastPublished as string) ?? 'DS 4.5.2',
    baseline: initialTokens.map((token) => ({ id: token.id, value: token.value }))
  }),
  getters: {
    selectedToken(state): Token | undefined {
      return state.tokens.find((token) => token.id === state.selectedTokenId);
    },
    filteredTokens(state): Token[] {
      const query = state.search.toLowerCase();
      return state.tokens.filter((token) => {
        const matchesSearch = !query || token.id.toLowerCase().includes(query) || token.name.includes(state.search);
        const matchesCategory = state.category === '全部' || token.category === state.category;
        return matchesSearch && matchesCategory;
      });
    },
    dependencyEdges(state) {
      return state.tokens.filter((token) => token.ref).map((token) => ({ from: token.ref!, to: token.id }));
    },
    cycleNodes(state): string[] {
      const graph = new Map<string, string>();
      state.tokens.filter((token) => token.ref).forEach((token) => graph.set(token.id, token.ref!));
      const cycle = new Set<string>();
      graph.forEach((_, start) => {
        const path: string[] = [];
        let current: string | undefined = start;
        while (current && !path.includes(current)) {
          path.push(current);
          current = graph.get(current);
        }
        if (current && path.includes(current)) path.slice(path.indexOf(current)).forEach((id) => cycle.add(id));
      });
      return [...cycle];
    },
    invalidReferences(state) {
      const ids = new Set(state.tokens.map((token) => token.id));
      return state.tokens.filter((token) => token.ref && !ids.has(token.ref));
    },
    contrastIssues(state) {
      const text = state.tokens.find((token) => token.id === 'color.text.primary');
      const surface = state.tokens.find((token) => token.id === 'color.surface.canvas');
      const values = [text?.themes[state.activeTheme], surface?.themes[state.activeTheme]].filter(Boolean) as string[];
      if (values.length < 2) return [];
      const ratio = hexContrastRatio(values[0], values[1]);
      return ratio > 0 && ratio < 4.5 ? [{ title: '正文与页面背景对比度不足', detail: `当前 ${ratio.toFixed(2)}:1，要求至少 4.5:1。` }] : [];
    },
    diffRows(state) {
      return state.tokens.filter((token) => {
        const base = state.baseline.find((item) => item.id === token.id);
        return !base || base.value !== token.value;
      }).map((token) => {
        const base = state.baseline.find((item) => item.id === token.id);
        return { id: token.id, before: base?.value ?? '新增', after: token.value, name: token.name };
      });
    },
    releaseReadiness(state): number {
      const base = 100 - this.cycleNodes.length * 25 - this.invalidReferences.length * 20 - this.contrastIssues.length * 15;
      return Math.max(0, base);
    },
    deprecatedTokens(state): Token[] {
      return state.tokens.filter((token) => token.status === 'deprecated');
    },
    migrationEdges(state) {
      const edges: { from: string; to: string; status: MigrationStatus; oldName: string; newName: string }[] = [];
      state.migrationBatches.forEach((batch) => {
        batch.mappings.forEach((mapping) => {
          if (mapping.status === '已落定' || mapping.status === '可处理' || mapping.status === '待确认') {
            const oldToken = state.tokens.find((t) => t.id === mapping.oldTokenId);
            const newToken = state.tokens.find((t) => t.id === mapping.newTokenId);
            edges.push({ from: mapping.oldTokenId, to: mapping.newTokenId, status: mapping.status, oldName: oldToken?.name ?? mapping.oldTokenId, newName: newToken?.name ?? mapping.newTokenId });
          }
        });
      });
      return edges;
    },
    affectedProductsFor(state) {
      return (tokenId: string): Record<string, string[]> => {
        const result: Record<string, string[]> = {};
        defaultThemes.forEach((theme) => {
          const affected: string[] = [];
          state.products.forEach((product) => {
            const used = state.productUsage[product.id] ?? [];
            if (used.some((tid) => chainThemeRef(state.tokens, tid, theme).includes(tokenId))) affected.push(product.id);
          });
          result[theme] = affected;
        });
        return result;
      };
    },
    productMigrationStatus(state): Record<string, { status: '已迁移' | '仍在旧引用'; refs: string[] }> {
      const deprecated = new Set(state.tokens.filter((token) => token.status === 'deprecated').map((token) => token.id));
      const result: Record<string, { status: '已迁移' | '仍在旧引用'; refs: string[] }> = {};
      state.products.forEach((product) => {
        const used = state.productUsage[product.id] ?? [];
        const refs = new Set<string>();
        used.forEach((tid) => {
          defaultThemes.forEach((theme) => {
            chainThemeRef(state.tokens, tid, theme).forEach((chainId) => {
              if (deprecated.has(chainId)) refs.add(chainId);
            });
          });
        });
        result[product.id] = { status: refs.size ? '仍在旧引用' : '已迁移', refs: [...refs] };
      });
      return result;
    },
    migrationGateFailures(state): { productId: string; productName: string; refs: string[] }[] {
      const status = this.productMigrationStatus as Record<string, { status: '已迁移' | '仍在旧引用'; refs: string[] }>;
      return Object.entries(status)
        .filter(([, item]) => item.status === '仍在旧引用')
        .map(([productId, item]) => ({ productId, productName: state.products.find((p) => p.id === productId)?.name ?? productId, refs: item.refs }));
    },
    migrationGatePass(): boolean {
      return this.migrationGateFailures.length === 0;
    }
  },
  actions: {
    selectToken(id: string) {
      this.selectedTokenId = id;
      this.persist();
    },
    updateTokenValue(id: string, value: string) {
      const token = this.tokens.find((item) => item.id === id);
      if (!token) return;
      token.value = value;
      token.themes[this.activeTheme] = value;
      if (value.startsWith('{') && value.endsWith('}')) token.ref = value.slice(1, -1);
      else delete token.ref;
      this.persist();
    },
    addToken(token: Token) {
      if (!this.tokens.some((item) => item.id === token.id)) this.tokens.push(token);
      this.persist();
    },
    setTheme(theme: string) {
      this.activeTheme = theme;
      this.persist();
    },
    setSearch(value: string) { this.search = value; this.persist(); },
    setCategory(value: string) { this.category = value; this.persist(); },
    acceptChange(id: string) {
      const change = this.changes.find((item) => item.id === id);
      if (!change) return;
      const token = this.tokens.find((item) => item.id === change.diff.token);
      if (token) this.updateTokenValue(token.id, change.diff.after);
      change.status = '已接受';
      this.persist();
    },
    rejectChange(id: string) {
      const change = this.changes.find((item) => item.id === id);
      if (change) change.status = '已退回';
      this.persist();
    },
    rollback() {
      this.baseline.forEach((base) => {
        const token = this.tokens.find((item) => item.id === base.id);
        if (token) token.value = base.value;
      });
      this.persist();
    },
    lockRelease() {
      if (this.cycleNodes.length === 0 && this.invalidReferences.length === 0 && this.contrastIssues.length === 0 && this.changes.every((item) => item.status !== '待评审')) {
        this.locked = true;
        this.lastPublished = `DS ${this.releaseVersion}`;
        this.publishSnapshot = cloneTokens(this.tokens);
      }
      this.persist();
    },
    registerMigrationBatch(title: string, mappings: { oldTokenId: string; newTokenId: string; productIds: string[]; themes: string[] }[]) {
      const batchId = `MB-${Date.now().toString(36)}`;
      const batchMappings = mappings.map((m) => makeMapping(batchId, m.oldTokenId, m.newTokenId, { productIds: m.productIds, themes: m.themes }));
      this.migrationBatches.push({ id: batchId, title, createdAt: Date.now(), baseVersion: this.migrationVersion, mappings: batchMappings, status: '草稿' });
      this.persist();
      return batchId;
    },
    validateBatch(batchId: string) {
      const batch = this.migrationBatches.find((item) => item.id === batchId);
      if (!batch) return;
      batch.mappings.forEach((mapping) => {
        const oldToken = this.tokens.find((item) => item.id === mapping.oldTokenId);
        const newToken = this.tokens.find((item) => item.id === mapping.newTokenId);
        if (!oldToken) {
          mapping.status = '已暂停';
          mapping.pauseReason = '缺环';
          mapping.pauseDetail = '旧令牌不存在，引用链缺环';
          return;
        }
        if (!newToken) {
          mapping.status = '已暂停';
          mapping.pauseReason = '缺环';
          mapping.pauseDetail = `替代令牌 ${mapping.newTokenId} 不存在，引用链断裂`;
          return;
        }
        if (newToken.status === 'deprecated') {
          const hasReplacement = this.migrationBatches.some((b) => b.status === '已全部落定' && b.mappings.some((m) => m.oldTokenId === newToken.id && m.status === '已落定'));
          if (!hasReplacement) {
            mapping.status = '已暂停';
            mapping.pauseReason = '缺环';
            mapping.pauseDetail = '替代令牌本身已下线且无有效替代关系';
            return;
          }
        }
        if (oldToken.category !== newToken.category) {
          mapping.status = '已暂停';
          mapping.pauseReason = '类型不一致';
          mapping.pauseDetail = `类型不一致：${oldToken.category} → ${newToken.category}`;
          return;
        }
        if (oldToken.category === 'color') {
          const themes = mapping.scope.themes.length ? mapping.scope.themes : defaultThemes;
          for (const theme of themes) {
            const fg = terminalThemeValue(this.tokens, mapping.newTokenId, theme);
            const bg = terminalThemeValue(this.tokens, 'color.surface.canvas', theme);
            if (fg && bg) {
              const ratio = hexContrastRatio(fg, bg);
              if (ratio > 0 && ratio < 4.5) {
                mapping.status = '已暂停';
                mapping.pauseReason = '对比度不达标';
                mapping.pauseDetail = `替代色在 ${theme} 主题下与背景对比度 ${ratio.toFixed(2)}:1，低于 4.5:1`;
                return;
              }
            }
          }
        }
        mapping.status = '可处理';
        delete mapping.pauseReason;
        delete mapping.pauseDetail;
      });
      batch.status = '已校验';
      this.persist();
    },
    settleMapping(mapping: MigrationMapping) {
      const oldId = mapping.oldTokenId;
      const newId = mapping.newTokenId;
      this.tokens.forEach((token) => {
        if (token.id === oldId) return;
        defaultThemes.forEach((theme) => {
          if (token.themes[theme] === `{${oldId}}`) token.themes[theme] = `{${newId}}`;
        });
        if (token.ref === oldId) token.ref = newId;
        if (token.value === `{${oldId}}`) token.value = `{${newId}}`;
      });
      mapping.scope.productIds.forEach((pid) => {
        const used = this.productUsage[pid];
        if (used) {
          const idx = used.indexOf(oldId);
          if (idx >= 0) used[idx] = newId;
        }
      });
      const oldToken = this.tokens.find((token) => token.id === oldId);
      if (oldToken) oldToken.status = 'deprecated';
      mapping.status = '已落定';
      mapping.settledAt = Date.now();
    },
    commitBatch(batchId: string, opts?: { forceFail?: boolean }): { ok: boolean; reason: string } {
      const batch = this.migrationBatches.find((item) => item.id === batchId);
      if (!batch) return { ok: false, reason: '批次不存在' };
      if (batch.baseVersion !== this.migrationVersion) {
        batch.status = '待确认';
        batch.mappings.forEach((mapping) => {
          mapping.status = '待确认';
          this.pendingConfirmations.push(mapping);
        });
        this.persist();
        return { ok: false, reason: '并发冲突：已有迁移先落定，本批按旧引用保留并登记待确认' };
      }
      if (opts?.forceFail) {
        this.tokens = cloneTokens(this.publishSnapshot);
        batch.status = '已回滚';
        this.persist();
        return { ok: false, reason: '迁移写入失败，已从上一个完整发布快照恢复' };
      }
      this.migrationLocked = true;
      batch.mappings.forEach((mapping) => {
        if (mapping.status === '可处理') this.settleMapping(mapping);
      });
      const settledCount = batch.mappings.filter((m) => m.status === '已落定').length;
      batch.status = settledCount === batch.mappings.length ? '已全部落定' : '部分落定';
      this.migrationVersion += 1;
      this.migrationLocked = false;
      this.persist();
      return { ok: true, reason: `已落定 ${settledCount} 项映射` };
    },
    simulateConcurrentSubmit(): { batchA: string; batchB: string } {
      const version = this.migrationVersion;
      const scope = { productIds: ['component-library', 'ops-admin', 'mobile'], themes: defaultThemes };
      const batchAId = `MB-${Date.now().toString(36)}-A`;
      const batchBId = `MB-${Date.now().toString(36)}-B`;
      const batchA: MigrationBatch = {
        id: batchAId,
        title: '标签页 A 提交',
        createdAt: Date.now(),
        baseVersion: version,
        status: '已校验',
        mappings: [
          (() => {
            const m = makeMapping(batchAId, 'color.base.blue.600', 'color.base.blue.800', scope);
            m.status = '可处理';
            return m;
          })()
        ]
      };
      const batchB: MigrationBatch = {
        id: batchBId,
        title: '标签页 B 提交',
        createdAt: Date.now(),
        baseVersion: version,
        status: '已校验',
        mappings: [
          (() => {
            const m = makeMapping(batchBId, 'color.base.blue.600', 'color.base.green.600', scope);
            m.status = '可处理';
            return m;
          })()
        ]
      };
      this.migrationBatches.push(batchA, batchB);
      this.commitBatch(batchAId);
      this.commitBatch(batchBId);
      this.persist();
      return { batchA: batchAId, batchB: batchBId };
    },
    simulateWriteFailure() {
      const batchId = `MB-${Date.now().toString(36)}-F`;
      const batch: MigrationBatch = {
        id: batchId,
        title: '写入失败演练',
        createdAt: Date.now(),
        baseVersion: this.migrationVersion,
        status: '草稿',
        mappings: [makeMapping(batchId, 'color.base.blue.600', 'color.base.blue.800', { productIds: ['component-library'], themes: defaultThemes })]
      };
      this.migrationBatches.push(batch);
      const result = this.commitBatch(batchId, { forceFail: true });
      return { batchId, result };
    },
    readCompatibleDraft() {
      this.tokens = cloneTokens(initialTokens);
      this.productUsage = JSON.parse(JSON.stringify(productUsage));
      this.migrationBatches = [];
      this.pendingConfirmations = [];
      this.migrationVersion = 0;
      this.migrationLocked = false;
      this.publishSnapshot = cloneTokens(initialTokens);
      this.persist();
    },
    persist() {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(storageKey, JSON.stringify({
          tokens: this.tokens,
          changes: this.changes,
          products: this.products,
          productUsage: this.productUsage,
          migrationBatches: this.migrationBatches,
          pendingConfirmations: this.pendingConfirmations,
          migrationVersion: this.migrationVersion,
          publishSnapshot: this.publishSnapshot,
          selectedBatchId: this.selectedBatchId,
          activeTheme: this.activeTheme,
          selectedTokenId: this.selectedTokenId,
          search: this.search,
          category: this.category,
          locked: this.locked,
          lastPublished: this.lastPublished
        }));
      }
    }
  }
});

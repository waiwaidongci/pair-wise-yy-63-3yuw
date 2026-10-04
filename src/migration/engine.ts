// 颜色令牌下线迁移引擎：纯函数，不依赖 Pinia / Vue，便于单测与回放。

export type ThemeId = 'light' | 'dark' | 'ops' | 'contrast';

export const THEME_OPTIONS: { value: ThemeId; label: string }[] = [
  { value: 'light', label: '明亮模式' },
  { value: 'dark', label: '暗色模式' },
  { value: 'ops', label: '运营模式' },
  { value: 'contrast', label: '高对比度' }
];

export const THEME_LABEL: Record<string, string> = {
  light: '明亮', dark: '暗色', ops: '运营', contrast: '高对比'
};

export type TokenCategory = 'color' | 'font' | 'spacing' | 'radius' | 'shadow' | 'component';

export interface EngineToken {
  id: string;
  name: string;
  category: TokenCategory;
  value: string;
  ref?: string;
  themes: Record<string, string>;
  usage: number;
  status: 'stable' | 'deprecated' | 'proposed';
  description: string;
}

/** 产品在每个主题下直接引用的令牌根集合 */
export type Rewrite = {
  theme: string;
  /** 被改写的引用节点；node === from 时表示产品直接使用旧令牌的根替换 */
  node: string;
  from: string;
  to: string;
  entryId: string;
};

export interface Product {
  id: string;
  name: string;
  themes: string[];
  refs: Record<string, string[]>;
  rewrites: Rewrite[];
}

export type EntryStatus = '待分析' | '已完成' | '已暂停' | '待确认';

export interface MigrationEntry {
  id: string;
  batchId: string;
  oldTokenId: string;
  replacementTokenId: string;
  scopeProductIds: string[];
  createdAt: string;
  note?: string;
  status: EntryStatus;
}

export interface PendingConflict {
  id: string;
  batchId: string;
  arrivedAt: string;
  reason: string;
  winningEntryId?: string;
  entries: MigrationEntry[];
}

export interface ReleaseSnapshot {
  id: string;
  kind: 'release' | 'migration';
  label: string;
  createdAt: string;
  /** 快照只保存“写入面”（令牌树与产品改写）；登记记录不随写入失败而丢失 */
  data: {
    tokens: EngineToken[];
    products: Product[];
  };
}

export type IssueCode = 'missing-link' | 'type-mismatch' | 'contrast' | 'not-color';

export interface Issue {
  code: IssueCode;
  message: string;
  themes?: string[];
}

export interface ThemeImpact {
  theme: string;
  chain: string[];
  affectedProducts: string[];
  inScopeProducts: string[];
  ratio?: number;
  contrastPass: boolean;
  note?: string;
}

export interface EntryAnalysis {
  entry: MigrationEntry;
  issues: Issue[];
  processable: boolean;
  oldToken?: EngineToken;
  replacement?: EngineToken;
  themes: ThemeImpact[];
}

export interface BatchAnalysis {
  batchId: string;
  rows: EntryAnalysis[];
  processable: EntryAnalysis[];
  blocked: EntryAnalysis[];
}

export interface EngineContext {
  tokens: EngineToken[];
  products: Product[];
  /** 旧稿兼容：被下线令牌在各主题的原始字面量，替代关系缺环时按原值读取 */
  legacyLiterals?: Record<string, Record<string, string>>;
  contrastGate?: (replacement: EngineToken) => number;
}

const SURFACE_ID = 'color.surface.canvas';
const REF_PATTERN = /^\{([\w.-]+)\}$/;

export function isRef(value: string | undefined): boolean {
  return !!value && REF_PATTERN.test(value);
}

export function refTarget(value: string | undefined): string | undefined {
  const match = value?.match(REF_PATTERN);
  return match?.[1];
}

export function contrastRatio(a: string, b: string): number {
  const luminance = (hex: string) => {
    const clean = hex.replace('#', '');
    if (clean.length !== 6) return 0.5;
    const channels = [0, 2, 4]
      .map((index) => parseInt(clean.slice(index, index + 2), 16) / 255)
      .map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  const l1 = luminance(a);
  const l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/** 文字类令牌要求 AA 4.5:1，其余控件/图形色按非文字对比度 3:1 */
export function contrastGateFor(token: EngineToken): number {
  const text = `${token.id} ${token.name}`.toLowerCase();
  return /text|文字|正文|foreground/i.test(text) ? 4.5 : 3;
}

function looksColor(value: string | undefined): boolean {
  return !!value && /^#[0-9a-fA-F]{6}$/.test(value.trim());
}

export interface ResolvedValue {
  value: string;
  chain: string[];
  dangling: boolean;
  compatibleFallback: boolean;
  reachesDeprecated: boolean;
}

/** 按产品/主题解析令牌引用链；rewrites 为已落定的迁移改写（产品维度） */
export function resolveToken(
  ctx: EngineContext,
  product: Product | undefined,
  theme: string,
  rootId: string
): ResolvedValue {
  const byId = new Map(ctx.tokens.map((token) => [token.id, token]));
  const chain: string[] = [];
  const guard = new Set<string>();
  let current = rootId;

  for (let depth = 0; depth < 32; depth += 1) {
    if (guard.has(current)) break;
    guard.add(current);

    // 根替换：产品直接引用旧令牌，迁移后整体跳到替代令牌
    const alias = product?.rewrites.find(
      (item) => item.theme === theme && item.node === current && item.from === current
    );
    if (alias) {
      chain.push(`${current} → ${alias.to}（产品改写）`);
      current = alias.to;
      continue;
    }

    const token = byId.get(current);
    if (!token) {
      // 旧稿没有替代关系时按原值兼容读取（仅回落至该悬空节点自身，不可跨节点套用根令牌字面量）
      const legacy = ctx.legacyLiterals?.[current]?.[theme];
      if (legacy) {
        return { value: legacy, chain, dangling: true, compatibleFallback: true, reachesDeprecated: false };
      }
      return { value: `{${current}}`, chain, dangling: true, compatibleFallback: false, reachesDeprecated: false };
    }

    chain.push(token.id);
    const raw = token.themes[theme] ?? token.value;
    const target = refTarget(raw);
    if (!target) {
      return {
        value: raw,
        chain,
        dangling: false,
        compatibleFallback: false,
        reachesDeprecated: chain.some((id) => byId.get(id)?.status === 'deprecated')
      };
    }

    const edge = product?.rewrites.find(
      (item) => item.theme === theme && item.node === current && item.from === target
    );
    if (edge) current = edge.to;
    else current = target;
  }

  const fallback = ctx.legacyLiterals?.[rootId]?.[theme];
  return {
    value: fallback ?? `{${current}}`,
    chain,
    dangling: true,
    compatibleFallback: !!fallback,
    reachesDeprecated: false
  };
}

/** 不考虑迁移改写的原始引用链（登记阶段做影响面分析） */
export function referenceChain(ctx: EngineContext, theme: string, rootId: string): string[] {
  return resolveToken(ctx, undefined, theme, rootId).chain.filter((step) => !step.includes('（产品改写）'));
}

/** 按引用链计算某个主题下会被旧令牌波及的产品 */
export function affectedProducts(
  ctx: EngineContext,
  theme: string,
  oldTokenId: string
): { product: Product; roots: string[][]; direct: boolean }[] {
  return ctx.products
    .filter((product) => product.themes.includes(theme))
    .map((product) => {
      const roots = (product.refs[theme] ?? [])
        .map((root) => referenceChain(ctx, theme, root))
        .filter((chain) => chain.includes(oldTokenId));
      return {
        product,
        roots,
        direct: (product.refs[theme] ?? []).includes(oldTokenId)
      };
    })
    .filter((item) => item.roots.length > 0);
}

export function analyzeEntry(entry: MigrationEntry, ctx: EngineContext): EntryAnalysis {
  const byId = new Map(ctx.tokens.map((token) => [token.id, token]));
  const oldToken = byId.get(entry.oldTokenId);
  const replacement = byId.get(entry.replacementTokenId);
  const issues: Issue[] = [];

  // 1) 替代关系缺环
  if (!replacement) {
    issues.push({
      code: 'missing-link',
      message: `替代令牌 ${entry.replacementTokenId} 不存在，替代链缺环；旧稿将按原值兼容读取。`
    });
  }

  // 2) 类型不一致
  if (replacement && replacement.category !== 'color') {
    issues.push({
      code: 'type-mismatch',
      message: `替代令牌类型为 ${replacement.category}，与待下线颜色令牌不一致。`
    });
  }

  // 3) 自身颜色值合法性
  if (replacement && replacement.category === 'color') {
    const badThemes = Object.entries(replacement.themes).filter(([, value]) => !looksColor(value));
    if (badThemes.length > 0) {
      issues.push({
        code: 'not-color',
        message: `替代令牌在 ${badThemes.map(([theme]) => THEME_LABEL[theme] ?? theme).join('、') } 主题不是颜色字面量，无法替换基础色。`,
        themes: badThemes.map(([theme]) => theme)
      });
    }
  }

  const scopeProducts = ctx.products.filter((product) => entry.scopeProductIds.includes(product.id));
  const inScopeThemes = [...new Set(scopeProducts.flatMap((product) => product.themes))];

  // 4) 对比度（范围内每个主题，替代色 vs 该主题画布色）
  const surface = byId.get(SURFACE_ID);
  const failedThemes: string[] = [];
  if (replacement && surface) {
    const gate = ctx.contrastGate?.(replacement) ?? contrastGateFor(replacement);
    inScopeThemes.forEach((theme) => {
      const fg = replacement.themes[theme];
      const bg = surface.themes[theme];
      if (looksColor(fg) && looksColor(bg) && contrastRatio(fg, bg) < gate) failedThemes.push(theme);
    });
    if (failedThemes.length > 0) {
      const gate = ctx.contrastGate?.(replacement) ?? contrastGateFor(replacement);
      issues.push({
        code: 'contrast',
        message: `替代色在 ${failedThemes.map((theme) => THEME_LABEL[theme] ?? theme).join('、') } 主题低于 ${gate}:1 对比度门禁。`,
        themes: failedThemes
      });
    }
  }

  const themeImpacts: ThemeImpact[] = inScopeThemes.map((theme) => {
    const impacted = affectedProducts(ctx, theme, entry.oldTokenId);
    const fg = replacement?.themes[theme];
    const bg = surface?.themes[theme];
    const ratio = looksColor(fg) && looksColor(bg) ? contrastRatio(fg!, bg!) : undefined;
    const gate = replacement ? ctx.contrastGate?.(replacement) ?? contrastGateFor(replacement) : 3;
    return {
      theme,
      chain: (() => {
        const first = impacted.find((item) => item.product.id === scopeProducts[0]?.id) ?? impacted[0];
        return first?.roots[0] ?? (oldToken ? [entry.oldTokenId] : []);
      })(),
      affectedProducts: impacted.map((item) => item.product.name),
      inScopeProducts: impacted
        .filter((item) => entry.scopeProductIds.includes(item.product.id))
        .map((item) => item.product.name),
      ratio,
      contrastPass: ratio === undefined ? true : ratio >= gate
    };
  });

  return {
    entry,
    issues,
    processable: issues.length === 0,
    oldToken,
    replacement,
    themes: themeImpacts
  };
}

export function analyzeBatch(entries: MigrationEntry[], ctx: EngineContext): BatchAnalysis {
  const rows = entries.map((entry) => analyzeEntry(entry, ctx));
  return {
    batchId: entries[0]?.batchId ?? '未分批',
    rows,
    processable: rows.filter((row) => row.processable),
    blocked: rows.filter((row) => !row.processable)
  };
}

/** 计算一条可处理迁移需要落的产品改写 */
export function planRewrites(
  entry: MigrationEntry,
  ctx: EngineContext
): { product: Product; rewrites: Rewrite[] }[] {
  const result: { product: Product; rewrites: Rewrite[] }[] = [];
  ctx.products
    .filter((product) => entry.scopeProductIds.includes(product.id))
    .forEach((product) => {
      const rewrites: Rewrite[] = [];
      product.themes.forEach((theme) => {
        (product.refs[theme] ?? []).forEach((root) => {
          const chain = referenceChain(ctx, theme, root);
          const oldIndex = chain.lastIndexOf(entry.oldTokenId);
          if (oldIndex === -1) return;
          if (oldIndex === 0) {
            // 产品直接引用旧令牌：根替换
            rewrites.push({
              theme, node: entry.oldTokenId, from: entry.oldTokenId, to: entry.replacementTokenId, entryId: entry.id
            });
          } else {
            // 引用链上旧令牌的直接上游节点改写引用边
            const parent = chain[oldIndex - 1];
            rewrites.push({
              theme, node: parent, from: entry.oldTokenId, to: entry.replacementTokenId, entryId: entry.id
            });
          }
        });
      });
      if (rewrites.length > 0) result.push({ product, rewrites });
    });
  return result;
}

export type ProductCellState = '已完成' | '旧引用' | '待确认' | '不适用' | '无迁移';

/** 产品 × 主题迁移矩阵 */
export function productMigrationMatrix(
  ctx: EngineContext,
  entries: MigrationEntry[],
  pending: PendingConflict[]
): { product: Product; cells: { theme: string; state: ProductCellState; detail?: string }[]; overall: ProductCellState }[] {
  const applied = entries.filter((entry) => entry.status === '已完成');
  return ctx.products.map((product) => {
    const cells = product.themes.map((theme): { theme: string; state: ProductCellState; detail?: string } => {
      const conflict = pending.find((item) =>
        item.entries.some(
          (entry) => entry.scopeProductIds.includes(product.id) && product.themes.includes(theme)
        )
      );
      if (conflict) return { theme, state: '待确认' as const, detail: `${conflict.batchId} 后到待确认` };

      const touching = applied.filter(
        (entry) =>
          entry.scopeProductIds.includes(product.id) &&
          (product.refs[theme] ?? []).some((root) => referenceChain(ctx, theme, root).includes(entry.oldTokenId))
      );
      const stillOld = (product.refs[theme] ?? []).some((root) =>
        resolveToken(ctx, product, theme, root).reachesDeprecated
      );
      if (touching.length === 0) {
        // 该主题没有落定到本产品的迁移：仍落到旧令牌才算旧引用，否则与本次下线无关
        return stillOld
          ? { theme, state: '旧引用' as const }
          : { theme, state: '无迁移' as const };
      }

      if (stillOld) return { theme, state: '旧引用' as const, detail: '仍有引用链落到旧令牌' };

      const mine = product.rewrites.filter(
        (rewrite) => touching.some((entry) => entry.id === rewrite.entryId) && rewrite.theme === theme
      );
      return mine.length > 0
        ? { theme, state: '已完成' as const, detail: `${mine.length} 条引用已改写` }
        : { theme, state: '旧引用' as const };
    });

    const states = cells.map((cell) => cell.state);
    const overall: ProductCellState = states.includes('待确认')
      ? '待确认'
      : states.every((state) => state === '已完成' || state === '不适用' || state === '无迁移')
        ? (states.includes('已完成') ? '已完成' : '无迁移')
        : '旧引用';
    return { product, cells, overall };
  });
}

export type GraphEdge = { from: string; to: string; kind: 'normal' | 'rerouted' | 'legacy' };

/** 依赖图在选定产品/主题下的边：普通 / 已改写（绿）/ 仍落旧令牌（红） */
export function productEdges(tokens: EngineToken[], product: Product | undefined, theme: string): GraphEdge[] {
  const byId = new Map(tokens.map((token) => [token.id, token]));
  const edges: GraphEdge[] = [];
  tokens.forEach((token) => {
    const raw = token.themes[theme] ?? token.value;
    const target = refTarget(raw);
    if (!target) return;
    const rewrite = product?.rewrites.find(
      (item) => item.theme === theme && item.node === token.id && item.from === target
    );
    if (rewrite) {
      edges.push({ from: token.id, to: rewrite.to, kind: 'rerouted' });
    } else {
      edges.push({
        from: token.id,
        to: target,
        kind: byId.get(target)?.status === 'deprecated' ? 'legacy' : 'normal'
      });
    }
  });
  // 产品直接引用旧令牌的根替换
  product?.rewrites
    .filter((rewrite) => rewrite.theme === theme && rewrite.node === rewrite.from)
    .forEach((rewrite) => edges.push({ from: rewrite.node, to: rewrite.to, kind: 'rerouted' }));
  return edges;
}

/** 令牌树下线视图：每个旧令牌仍在旧引用 / 已完成迁移的产品清单 */
export function deprecatedUsageView(
  ctx: EngineContext,
  entries: MigrationEntry[]
): Record<string, { replacementTokenId?: string; oldProducts: string[]; migratedProducts: string[]; pendingProducts: string[] }> {
  const view: Record<string, { replacementTokenId?: string; oldProducts: string[]; migratedProducts: string[]; pendingProducts: string[] }> = {};
  entries.forEach((entry) => {
    const bucket = (view[entry.oldTokenId] ??= { oldProducts: [], migratedProducts: [], pendingProducts: [] });
    if (entry.status !== '待确认') bucket.replacementTokenId = entry.replacementTokenId;
    ctx.products.forEach((product) => {
      const touches = product.themes.some((theme) =>
        (product.refs[theme] ?? []).some((root) => referenceChain(ctx, theme, root).includes(entry.oldTokenId))
      );
      if (!touches) return;
      const inScope = entry.scopeProductIds.includes(product.id);
      if (entry.status === '待确认') {
        if (!bucket.pendingProducts.includes(product.name)) bucket.pendingProducts.push(product.name);
        return;
      }
      const migrated = product.rewrites.some((rewrite) => rewrite.entryId === entry.id);
      if (migrated) {
        if (!bucket.migratedProducts.includes(product.name)) bucket.migratedProducts.push(product.name);
      } else if (inScope || entry.status === '已完成') {
        if (!bucket.oldProducts.includes(product.name)) bucket.oldProducts.push(product.name);
      } else if (!bucket.oldProducts.includes(product.name)) {
        bucket.oldProducts.push(product.name);
      }
    });
  });
  return view;
}

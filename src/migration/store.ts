import { defineStore } from 'pinia';
import {
  analyzeBatch,
  contrastRatio,
  planRewrites,
  productMigrationMatrix,
  refTarget,
  resolveToken,
  type EngineContext,
  type EngineToken,
  type EntryAnalysis,
  type MigrationEntry,
  type PendingConflict,
  type Product,
  type ReleaseSnapshot
} from './engine';import { seedLegacyLiterals, seedMigrationTokens, seedProducts } from './seed';

const STORAGE_KEY = 'yy63-color-migration-v1';
const CHANNEL_NAME = 'yy63-color-migration';

export interface RegisterInput {
  oldTokenId: string;
  replacementTokenId: string;
  scopeProductIds: string[];
  note?: string;
}

export interface LogLine {
  time: string;
  text: string;
  tone: 'info' | 'success' | 'warn' | 'danger';
}

interface PersistedState {
  tokens: EngineToken[];
  products: Product[];
  entries: MigrationEntry[];
  pending: PendingConflict[];
  snapshots: ReleaseSnapshot[];
  legacyLiterals: Record<string, Record<string, string>>;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function nowLabel(): string {
  return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function loadState(): PersistedState | null {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PersistedState;
  } catch {
    return null;
  }
}

const SENDER_ID = Math.random().toString(36).slice(2, 10);

const fresh = (): PersistedState => {
  const tokens = clone(seedMigrationTokens);
  const products = clone(seedProducts);
  const legacyLiterals = clone(seedLegacyLiterals);
  const baseline: ReleaseSnapshot = {
    id: 'REL-4.5.2',
    kind: 'release',
    label: 'DS 4.5.2（迁移前完整发布快照）',
    createdAt: '2026-09-24 17:20:00',
    data: { tokens, products }
  };
  return { tokens, products, entries: [], pending: [], snapshots: [baseline], legacyLiterals };
};

export const useMigrationStore = defineStore('color-migration', {
  state: () => {
    const initial = loadState() ?? fresh();
    return {
      ...initial,
      activeProductId: 'p-web',
      activeTheme: 'light',
      logs: [
        { time: nowLabel(), text: '迁移工作台就绪：4 个产品、2 个下线颜色令牌待登记。', tone: 'info' }
      ] as LogLine[],
      failInjection: false,
      inflightBatchIds: [] as string[],
      lastBatchResult: '' as string
    };
  },
  getters: {
    ctx(state): EngineContext {
      return { tokens: state.tokens, products: state.products, legacyLiterals: state.legacyLiterals };
    },
    deprecatedTokens(state): EngineToken[] {
      return state.tokens.filter((token) => token.status === 'deprecated');
    },
    colorTokens(state): EngineToken[] {
      return state.tokens.filter((token) => token.category === 'color');
    },
    productById(state): (id: string) => Product | undefined {
      return (id: string) => state.products.find((product) => product.id === id);
    },
    activeProduct(state): Product | undefined {
      return state.products.find((product) => product.id === state.activeProductId);
    },
    pendingAnalysis(state): EntryAnalysis[] {
      const candidates = state.entries.filter((entry) => entry.status === '待分析');
      if (candidates.length === 0) return [];
      return analyzeBatch(candidates, {
        tokens: state.tokens,
        products: state.products,
        legacyLiterals: state.legacyLiterals
      }).rows;
    },
    /** 每个登记批次的门禁分析：可处理项 vs 暂停项 */
    batchAnalyses(state): { batchId: string; rows: EntryAnalysis[]; processable: EntryAnalysis[]; blocked: EntryAnalysis[] }[] {
      const groups = new Map<string, MigrationEntry[]>();
      state.entries.forEach((entry) => {
        const list = groups.get(entry.batchId) ?? [];
        list.push(entry);
        groups.set(entry.batchId, list);
      });
      const context = { tokens: state.tokens, products: state.products, legacyLiterals: state.legacyLiterals };
      return [...groups.entries()].map(([batchId, entries]) => {
        const analysis = analyzeBatch(entries, context);
        return { batchId, rows: analysis.rows, processable: analysis.processable, blocked: analysis.blocked };
      });
    },
    pendingEntries(state): MigrationEntry[] {
      return state.entries.filter((entry) => entry.status === '待确认');
    },
    pausedEntries(state): MigrationEntry[] {
      return state.entries.filter((entry) => entry.status === '已暂停');
    },
    completedEntries(state): MigrationEntry[] {
      return state.entries.filter((entry) => entry.status === '已完成');
    },
    matrix(state) {
      return productMigrationMatrix(
        { tokens: state.tokens, products: state.products, legacyLiterals: state.legacyLiterals },
        state.entries,
        state.pending
      );
    },
    /** 令牌树：旧令牌仍被哪些产品旧引用 / 已迁移 / 待确认 */
    treeView(state) {
      const byOld = new Map<string, { replacementTokenId?: string; oldProducts: string[]; migratedProducts: string[]; pendingProducts: string[] }>();
      state.entries.forEach((entry) => {
        const bucket = byOld.get(entry.oldTokenId) ?? {
          oldProducts: [], migratedProducts: [], pendingProducts: []
        };
        if (entry.status !== '待确认') bucket.replacementTokenId = entry.replacementTokenId;
        state.products.forEach((product) => {
          const touches = product.themes.some((theme) =>
            (product.refs[theme] ?? []).some((root) =>
              resolveToken(
                { tokens: state.tokens, products: state.products, legacyLiterals: state.legacyLiterals },
                undefined, theme, root
              ).chain.includes(entry.oldTokenId)
            )
          );
          if (!touches) return;
          const migrated = product.rewrites.some((rewrite) => rewrite.entryId === entry.id);
          const target = migrated
            ? bucket.migratedProducts
            : entry.status === '待确认'
              ? bucket.pendingProducts
              : bucket.oldProducts;
          if (!target.includes(product.name)) target.push(product.name);
        });
        byOld.set(entry.oldTokenId, bucket);
      });
      return byOld;
    },
    /** 依赖图基础校验（复用到发布门禁） */
    graphChecks(state) {
      const ids = new Set(state.tokens.map((token) => token.id));
      const invalid = state.tokens.filter((token) => {
        const target = refTarget(token.value);
        return target && !ids.has(target) && !state.legacyLiterals[target];
      });
      const graph = new Map<string, string>();
      state.tokens.forEach((token) => {
        const target = refTarget(token.themes[state.activeTheme] ?? token.value);
        if (target && ids.has(target)) graph.set(token.id, target);
      });
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
      const text = state.tokens.find((token) => token.id === 'color.text.primary');
      const surface = state.tokens.find((token) => token.id === 'color.surface.canvas');
      const fg = text?.themes[state.activeTheme];
      const bg = surface?.themes[state.activeTheme];
      const ratio = fg && bg ? contrastRatio(fg, bg) : undefined;
      return {
        invalid,
        cycle: [...cycle],
        contrastRatio: ratio,
        contrastPass: ratio === undefined ? true : ratio >= 4.5
      };
    },
    gateSummary(state): {
      ready: boolean;
      completedProducts: number;
      legacyProducts: number;
      pendingProducts: number;
      checks: { label: string; pass: boolean; detail: string }[];
    } {
      const graph = this.graphChecks;
      const matrix = this.matrix;
      const completed = matrix.filter((row) => row.overall === '已完成' && row.cells.some((cell) => cell.state === '已完成')).length;
      const pending = new Set<string>();
      state.pending.forEach((item) => item.entries.forEach((entry) => entry.scopeProductIds.forEach((id) => pending.add(id))));
      const legacy = matrix.filter((row) => row.overall === '旧引用').map((row) => row.product.id);
      const unresolvedRegistrations = state.entries.filter((entry) => entry.status === '待分析').length;
      const pausedByType = this.pausedEntries.some((entry) => {
        const replacement = state.tokens.find((token) => token.id === entry.replacementTokenId);
        return replacement && replacement.category !== 'color';
      });
      const checks = [
        { label: '替代链完整（无缺环）', pass: !this.pausedEntries.some((entry) => !state.tokens.some((token) => token.id === entry.replacementTokenId)), detail: this.pausedEntries.length ? `${this.pausedEntries.length} 条登记已暂停` : '全部替代令牌可解析' },
        { label: '类型一致', pass: !pausedByType, detail: pausedByType ? '存在颜色令牌被非颜色令牌替代的暂停项' : '颜色令牌均映射到颜色令牌' },
        { label: '对比度门禁', pass: graph.contrastPass, detail: graph.contrastRatio ? `正文/背景 ${graph.contrastRatio.toFixed(2)}:1（AA 4.5:1）` : '当前主题无需检查' },
        { label: '引用完整性', pass: graph.invalid.length === 0, detail: graph.invalid.length ? `${graph.invalid.length} 个悬空引用` : '无悬空引用（旧稿按原值兼容）' },
        { label: '循环依赖', pass: graph.cycle.length === 0, detail: graph.cycle.length ? graph.cycle.join('、') : '无循环' },
        { label: '并发待确认已清零', pass: state.pending.length === 0, detail: state.pending.length ? `${state.pending.length} 组后到映射待确认` : '无并发冲突' },
        { label: '登记批次均已处理', pass: unresolvedRegistrations === 0, detail: unresolvedRegistrations ? `${unresolvedRegistrations} 条登记尚未提交` : '全部已提交' }
      ];
      const ready = graph.invalid.length === 0 && graph.cycle.length === 0 && graph.contrastPass && unresolvedRegistrations === 0;
      return {
        ready,
        completedProducts: completed,
        legacyProducts: legacy.length,
        pendingProducts: pending.size,
        checks
      };
    },
    lastSnapshot(state): ReleaseSnapshot | undefined {
      return state.snapshots[state.snapshots.length - 1];
    }
  },
  actions: {
    log(text: string, tone: LogLine['tone'] = 'info') {
      this.logs.unshift({ time: nowLabel(), text, tone });
      if (this.logs.length > 60) this.logs.length = 60;
    },
    setActiveProduct(id: string) { this.activeProductId = id; },
    setActiveTheme(theme: string) { this.activeTheme = theme; },
    setFailInjection(value: boolean) {
      this.failInjection = value;
      this.log(value ? '已开启写入故障注入：下一次提交将在写入中途失败。' : '已关闭故障注入。', value ? 'warn' : 'info');
    },
    persist() {
      if (typeof localStorage === 'undefined') return;
      const payload: PersistedState = {
        tokens: this.tokens,
        products: this.products,
        entries: this.entries,
        pending: this.pending,
        snapshots: this.snapshots,
        legacyLiterals: this.legacyLiterals
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    },
    registerBatch(inputs: RegisterInput[]): string {
      const batchId = `BATCH-${String(this.entries.length + 1).padStart(3, '0')}`;
      inputs.forEach((input, index) => {
        this.entries.push({
          id: `MIG-${String(this.entries.length + 1).padStart(3, '0')}`,
          batchId,
          oldTokenId: input.oldTokenId,
          replacementTokenId: input.replacementTokenId,
          scopeProductIds: input.scopeProductIds,
          createdAt: new Date(Date.now() + index).toISOString(),
          note: input.note,
          status: '待分析'
        });
      });
      this.log(`维护员登记批次 ${batchId}：${inputs.length} 条旧令牌 → 替代令牌映射，等待引用链分析。`);
      this.persist();
      return batchId;
    },
    /** 提交一个批次：门禁分流 → 并发裁决 → 事务写入（失败回滚到上一个完整快照） */
    async commitBatch(batchId: string, opts: { delayMs?: number; tag?: string } = {}): Promise<void> {
      if (this.inflightBatchIds.includes(batchId)) return;
      this.inflightBatchIds.push(batchId);
      if (opts.delayMs) await new Promise((resolve) => setTimeout(resolve, opts.delayMs));

      const snapshot = this.snapshots[this.snapshots.length - 1];
      const candidates = this.entries.filter((entry) => entry.batchId === batchId && entry.status === '待分析');
      if (candidates.length === 0) {
        this.inflightBatchIds = this.inflightBatchIds.filter((id) => id !== batchId);
        return;
      }

      const context = { tokens: this.tokens, products: this.products, legacyLiterals: this.legacyLiterals };
      const analysis = analyzeBatch(candidates, context);
      const tag = opts.tag ? `（${opts.tag}）` : '';

      // —— 门禁分流：缺环 / 类型不一致 / 对比度不达标 → 暂停，只保留可处理项 ——
      analysis.blocked.forEach((row) => {
        const entry = this.entries.find((item) => item.id === row.entry.id);
        if (entry) entry.status = '已暂停';
        this.log(`批次 ${batchId}${tag} 暂停：${row.oldToken?.name ?? row.entry.oldTokenId} → ${row.entry.replacementTokenId}；${row.issues.map((issue) => issue.message).join('；')}`, 'warn');
      });

      let accepted = 0;
      let conflicted = 0;

      try {
        for (const row of analysis.processable) {
          const entry = this.entries.find((item) => item.id === row.entry.id);
          if (!entry) continue;

          // —— 并发裁决：与已落定映射在同一产品范围指向同一旧令牌时，后到内容保留旧引用并登记待确认 ——
          const winner = this.findConflictingWinner(entry);
          if (winner) {
            entry.status = '待确认';
            const conflictId = `CFL-${String(this.pending.length + 1).padStart(3, '0')}`;
            this.pending.push({
              id: conflictId,
              batchId,
              arrivedAt: new Date().toISOString(),
              reason: `与先落定的 ${winner.batchId}/${winner.id} 映射同一旧令牌，产品范围重叠；后到内容按旧引用保留。`,
              winningEntryId: winner.id,
              entries: [clone(entry)]
            });
            conflicted += 1;
            this.log(`并发裁决：${batchId}${tag} 的 ${entry.id} 后到，${winner.id} 的映射先生效，本条登记待确认，产品继续走旧引用。`, 'warn');
            this.broadcast('conflict', conflictId);
            continue;
          }

          const plan = planRewrites(entry, context);
          if (plan.length === 0) {
            entry.status = '已完成';
            accepted += 1;
            continue;
          }

          // 事务写入：逐产品追加改写边
          plan.forEach(({ product, rewrites }, planIndex) => {
            if (this.failInjection && planIndex >= 1) {
              throw new Error('令牌树写入失败：产品改写边持久化超时（模拟故障）');
            }
            const target = this.products.find((item) => item.id === product.id);
            if (!target) return;
            rewrites.forEach((rewrite) => {
              const exists = target.rewrites.some(
                (item) => item.theme === rewrite.theme && item.node === rewrite.node && item.from === rewrite.from
              );
              if (!exists) target.rewrites.push(clone(rewrite));
            });
          });
          entry.status = '已完成';
          accepted += 1;
        }

        if (this.failInjection && accepted === 0 && analysis.processable.length > 0) {
          throw new Error('令牌树写入失败：首条改写边即被拒绝（模拟故障）');
        }

        if (accepted > 0) {
          const release: ReleaseSnapshot = {
            id: `SNAP-${Date.now().toString(36).toUpperCase()}`,
            kind: 'migration',
            label: `${batchId}${tag} 迁移发布快照 · ${accepted} 条映射落定`,
            createdAt: new Date().toISOString(),
            data: {
              tokens: clone(this.tokens),
              products: clone(this.products)
            }
          };
          this.snapshots.push(release);
          if (this.snapshots.length > 12) this.snapshots.splice(0, this.snapshots.length - 12);
          this.log(`批次 ${batchId}${tag} 写入完成：${accepted} 条映射生效，已生成完整发布快照 ${release.id}。`, 'success');
          this.broadcast('committed', batchId);
        }

        if (analysis.blocked.length > 0 && accepted === 0 && conflicted === 0) {
          this.log(`批次 ${batchId}${tag} 全部条目被门禁暂停，未产生任何写入。`, 'warn');
        }
        this.lastBatchResult = `生效 ${accepted} 条 · 暂停 ${analysis.blocked.length} 条 · 待确认 ${conflicted} 条`;
      } catch (error) {
        // —— 写入失败：从上一个完整发布快照恢复 ——
        const message = error instanceof Error ? error.message : String(error);
        this.log(`迁移写入失败：${message}；正在从上一个完整发布快照 ${snapshot.id} 恢复令牌树……`, 'danger');
        this.restoreFrom(snapshot, false);
        this.log(`已恢复到 ${snapshot.label}，本批次写入全部回滚，登记保留为待分析，可重试。`, 'danger');
        this.lastBatchResult = '写入失败，已回滚';
      } finally {
        this.inflightBatchIds = this.inflightBatchIds.filter((id) => id !== batchId);
        this.persist();
      }
    },
    findConflictingWinner(entry: MigrationEntry): MigrationEntry | undefined {
      const earlier = this.entries
        .filter((item) => item.status === '已完成' && item.oldTokenId === entry.oldTokenId && item.id !== entry.id)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      return earlier.find((item) => item.scopeProductIds.some((id) => entry.scopeProductIds.includes(id)));
    },
    /** 模拟两个标签页几乎同时提交同一旧令牌的两版映射 */
    async simulateTwoTabs() {
      this.log('标签页 A / 标签页 B 同时提交 color.deprecated.accent 的两版映射（跨标签页仲裁）……', 'info');
      const batchA = this.registerBatch([
        {
          oldTokenId: 'color.deprecated.accent',
          replacementTokenId: 'color.base.blue.800',
          scopeProductIds: ['p-web', 'p-ops'],
          note: '标签页 A：强调色收敛到品牌蓝 800'
        }
      ]);
      const batchB = this.registerBatch([
        {
          oldTokenId: 'color.deprecated.accent',
          replacementTokenId: 'color.base.blue.400',
          scopeProductIds: ['p-ops', 'p-mobile'],
          note: '标签页 B：强调色改用品牌蓝 400'
        }
      ]);
      this.broadcast('intent', batchB);
      await Promise.all([
        this.commitBatch(batchA, { delayMs: 120, tag: '标签页 A' }),
        this.commitBatch(batchB, { delayMs: 420, tag: '标签页 B' })
      ]);
    },
    restoreFrom(snapshot: ReleaseSnapshot, announce = true) {
      // 仅回滚“写入面”（令牌树、依赖图、产品改写）；迁移登记与待确认记录保留
      this.tokens = clone(snapshot.data.tokens);
      this.products = clone(snapshot.data.products);
      this.persist();
      if (announce) this.log(`已从快照 ${snapshot.id}（${snapshot.label}）恢复令牌树与依赖图，迁移登记保留。`, 'warn');
    },
    resolveConflicted(entryId: string, keep: 'winner' | 'arrival') {
      const conflict = this.pending.find((item) => item.entries.some((entry) => entry.id === entryId));
      const entry = this.entries.find((item) => item.id === entryId);
      if (!conflict || !entry) return;
      if (keep === 'winner') {
        this.entries = this.entries.filter((item) => item.id !== entryId);
        this.log(`待确认 ${entryId} 已按先落定映射结案：放弃后到内容，产品保持 ${conflict.winningEntryId} 的改写。`, 'success');
      } else {
        entry.status = '待分析';
        this.pending = this.pending.filter((item) => item.id !== conflict.id);
        this.log(`待确认 ${entryId} 重新进入分析队列，将在下一批次按新映射提交。`, 'info');
      }
      if (keep === 'winner') this.pending = this.pending.filter((item) => item.id !== conflict.id);
      this.persist();
    },
    broadcast(type: string, payload: string) {
      if (typeof window === 'undefined') return;
      try {
        const channel = new BroadcastChannel(CHANNEL_NAME);
        channel.postMessage({ type, payload, at: Date.now(), sender: SENDER_ID });
        channel.close();
      } catch {
        // BroadcastChannel 不可用时仅靠 localStorage 持久化。
      }
    },
    /** 监听其他标签页的落定 / 冲突事件，从 localStorage 同步先落定结果 */
    initChannel() {
      if (typeof window === 'undefined' || (window as unknown as { __yy63MigChannel?: boolean }).__yy63MigChannel) return;
      try {
        const channel = new BroadcastChannel(CHANNEL_NAME);
        (window as unknown as { __yy63MigChannel?: boolean }).__yy63MigChannel = true;
        channel.addEventListener('message', (event: MessageEvent) => {
          const data = event.data as { type?: string; sender?: string } | null;
          if (!data || data.sender === SENDER_ID) return;
          if (data.type !== 'committed' && data.type !== 'conflict') return;
          const saved = loadState();
          if (!saved) return;
          this.tokens = saved.tokens;
          this.products = saved.products;
          this.entries = saved.entries;
          this.pending = saved.pending;
          this.snapshots = saved.snapshots;
          this.legacyLiterals = saved.legacyLiterals;
          this.log(`检测到其他标签页已落定迁移，已同步其发布快照与产品改写。`, 'info');
        });
      } catch {
        // BroadcastChannel 不可用时忽略，本页仍可正常裁决。
      }
    },
    resetDemo() {
      const state = fresh();
      this.tokens = state.tokens;
      this.products = state.products;
      this.entries = [];
      this.pending = [];
      this.snapshots = state.snapshots;
      this.legacyLiterals = state.legacyLiterals;
      this.logs = [{ time: nowLabel(), text: '演示数据已重置。', tone: 'info' }];
      this.lastBatchResult = '';
      this.persist();
    }
  }
});

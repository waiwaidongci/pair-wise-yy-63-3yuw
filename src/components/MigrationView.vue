<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  productEdges,
  resolveToken,
  THEME_OPTIONS,
  type EngineToken,
  type GraphEdge,
  type ProductCellState
} from '../migration/engine';
import { useMigrationStore } from '../migration/store';

const store = useMigrationStore();

// —— 登记表单 ——
const MISSING = '__missing__';
const registerDialog = ref(false);
const form = ref({
  oldTokenId: 'color.deprecated.brand',
  replacementValue: 'color.base.brand.600',
  scope: ['p-web', 'p-ops'],
  note: ''
});

const replacementOptions = computed(() => [
  { label: '缺环演示：color.base.missing.purple（不存在）', value: MISSING },
  ...store.tokens.map((token) => ({
    label: `${token.name}（${token.id} · ${token.category}）`,
    value: token.id
  }))
]);
const productOptions = computed(() => store.products.map((product) => ({ label: product.name, value: product.id })));

function submitRegister() {
  const replacementTokenId = form.value.replacementValue === MISSING ? 'color.base.missing.purple' : form.value.replacementValue;
  if (form.value.scope.length === 0) return;
  const batchId = store.registerBatch([
    {
      oldTokenId: form.value.oldTokenId,
      replacementTokenId,
      scopeProductIds: form.value.scope,
      note: form.value.note || undefined
    }
  ]);
  registerDialog.value = false;
  void store.commitBatch(batchId);
}

function registerMixedDemo() {
  const batchId = store.registerBatch([
    { oldTokenId: 'color.deprecated.brand', replacementTokenId: 'color.base.brand.600', scopeProductIds: ['p-web'], note: '可处理：官网门户迁移到新版品牌色' },
    { oldTokenId: 'color.deprecated.accent', replacementTokenId: 'color.base.teal.400', scopeProductIds: ['p-web', 'p-mobile'], note: '对比度暂停：明亮模式替代色不达标' },
    { oldTokenId: 'color.deprecated.brand', replacementTokenId: 'shadow.raised', scopeProductIds: ['p-mobile'], note: '类型不一致暂停：阴影令牌不能替代颜色' },
    { oldTokenId: 'color.deprecated.accent', replacementTokenId: 'color.base.missing.purple', scopeProductIds: ['p-ops'], note: '替代关系缺环暂停' }
  ]);
  void store.commitBatch(batchId);
}

// —— 引用链 ——
const chainRoots = computed(() => store.activeProduct?.refs[store.activeTheme] ?? []);
const resolvedRoots = computed(() =>
  chainRoots.value.map((root) => ({
    root,
    result: resolveToken(store.ctx, store.activeProduct ?? undefined, store.activeTheme, root)
  }))
);

// 旧稿兼容读取演示：引用一个已无替代关系的旧稿令牌
const compatDemo = computed(() =>
  resolveToken(store.ctx, store.activeProduct ?? undefined, store.activeTheme, 'color.legacy.unmapped')
);

function tokenName(id: string): string {
  return store.tokens.find((token) => token.id === id)?.name ?? id;
}
function isDeprecated(id: string): boolean {
  return store.tokens.find((token) => token.id === id)?.status === 'deprecated';
}

// —— 依赖图布局 ——
interface PositionedToken extends EngineToken { x: number; y: number; }
const graphLayers = computed(() => {
  const groups: PositionedToken[][] = [[], [], []];
  store.tokens
    .filter((token) => !token.id.startsWith('color.text.') && token.id !== 'color.surface.canvas')
    .forEach((token) => {
      const layer = token.id.startsWith('color.semantic.') ? 1 : token.id.startsWith('component.') ? 2 : 0;
      groups[layer].push({ ...token, x: [80, 320, 560][layer], y: 46 + groups[layer].length * 70 });
    });
  return groups;
});
const positionedNodes = computed(() => {
  const all = new Map<string, PositionedToken>();
  graphLayers.value.flat().forEach((node) => all.set(node.id, node));
  return all;
});
const productPseudo = computed(() => ({ x: 760, y: 300, name: store.activeProduct?.name ?? '' }));
const visibleEdges = computed<(GraphEdge & { pseudo?: boolean })[]>(() => {
  const edges: (GraphEdge & { pseudo?: boolean })[] = productEdges(store.tokens, store.activeProduct, store.activeTheme);
  const roots = store.activeProduct?.refs[store.activeTheme] ?? [];
  roots.forEach((root) => edges.push({ from: `pseudo:${store.activeProductId}`, to: root, kind: 'normal', pseudo: true }));
  return edges;
});
function edgePath(edge: GraphEdge & { pseudo?: boolean }): string {
  const from = edge.from.startsWith('pseudo:')
    ? productPseudo.value
    : positionedNodes.value.get(edge.from);
  const to = positionedNodes.value.get(edge.to);
  if (!from || !to) return '';
  return `M ${from.x + 60} ${from.y} C ${from.x + 110} ${from.y}, ${to.x - 110} ${to.y}, ${to.x - 60} ${to.y}`;
}
const migratedTargetIds = computed(() => new Set(
  visibleEdges.value.filter((edge) => edge.kind === 'rerouted').map((edge) => edge.to)
));

// —— 发布门禁 ——
const stateTheme: Record<ProductCellState, string> = {
  已完成: 'success',
  旧引用: 'danger',
  待确认: 'warning',
  不适用: 'default',
  无迁移: 'default'
};

const overallStats = computed(() => ({
  entries: store.entries.length,
  completed: store.completedEntries.length,
  paused: store.pausedEntries.length,
  pending: store.pendingEntries.length
}));
</script>

<template>
  <div class="migration-view">
    <div class="mig-toolbar panel">
      <div class="mig-toolbar-info">
        <strong>颜色令牌下线迁移</strong>
        <span>登记旧令牌 / 替代令牌 / 迁移范围，按引用链分析影响产品，门禁分流后事务写入。</span>
      </div>
      <div class="mig-toolbar-actions">
        <t-button variant="outline" @click="registerMixedDemo">登记示例批次</t-button>
        <t-button variant="outline" @click="store.simulateTwoTabs()">模拟两个标签页并发</t-button>
        <label class="switch-wrap"><span class="switch-label">故障注入</span><t-switch :value="store.failInjection" @change="(v: boolean) => store.setFailInjection(v)" /></label>
        <t-button theme="primary" @click="registerDialog = true">登记迁移</t-button>
        <t-button variant="text" @click="store.resetDemo">重置演示</t-button>
      </div>
    </div>

    <div class="mig-body">
      <t-tabs class="mig-tabs panel" placement="top">
        <!-- ① 批次与门禁 -->
        <t-tab-panel value="batch" label="① 批次与门禁">
          <div class="tab-inner">
            <div class="stat-strip">
              <div><span>累计登记</span><strong>{{ overallStats.entries }}</strong></div>
              <div class="ok"><span>已完成迁移</span><strong>{{ overallStats.completed }}</strong></div>
              <div class="warn"><span>门禁暂停</span><strong>{{ overallStats.paused }}</strong></div>
              <div class="warn"><span>并发待确认</span><strong>{{ overallStats.pending }}</strong></div>
            </div>

            <t-empty v-if="store.batchAnalyses.length === 0" description="尚未登记迁移。点击右上角「登记迁移」或「登记示例批次」。" class="mig-empty" />

            <div v-for="batch of store.batchAnalyses" :key="batch.batchId" class="batch-card">
              <div class="batch-head">
                <div><strong>{{ batch.batchId }}</strong><span>{{ batch.processable.length }} 条可处理 · {{ batch.blocked.length }} 条暂停</span></div>
                <t-tag v-if="batch.blocked.length" theme="warning" variant="light">本批已暂停问题条目，仅保留可处理项写入</t-tag>
              </div>

              <div v-for="row of batch.rows" :key="row.entry.id" class="entry-row" :class="{ blocked: !row.processable }">
                <div class="entry-main">
                  <div class="entry-flow">
                    <t-tag size="small" theme="danger" variant="light">{{ row.oldToken?.name ?? row.entry.oldTokenId }}</t-tag>
                    <t-icon name="arrow-right" />
                    <t-tag size="small" :theme="row.processable ? 'success' : 'default'" variant="light">{{ row.replacement?.name ?? row.entry.replacementTokenId }}</t-tag>
                    <t-tag size="small" variant="outline">{{ row.entry.status }}</t-tag>
                  </div>
                  <div class="entry-meta">
                    <span>{{ row.entry.id }}</span>
                    <span>范围：{{ row.entry.scopeProductIds.map((id) => store.productById(id)?.name ?? id).join('、') }}</span>
                    <span v-if="row.entry.note">{{ row.entry.note }}</span>
                  </div>
                  <ul v-if="row.issues.length" class="issue-list">
                    <li v-for="issue in row.issues" :key="issue.code">
                      <t-icon name="error-circle" />
                      <span>{{ issue.message }}</span>
                    </li>
                  </ul>
                </div>

                <table class="impact-table">
                  <thead><tr><th>主题</th><th>引用链（按范围产品解析）</th><th>受影响产品</th><th>替代色对比度</th></tr></thead>
                  <tbody>
                    <tr v-for="impact in row.themes" :key="impact.theme">
                      <td>{{ THEME_OPTIONS.find((t) => t.value === impact.theme)?.label ?? impact.theme }}</td>
                      <td class="chain-cell">
                        <template v-for="(step, i) in impact.chain" :key="i">
                          <span :class="{ legacy: isDeprecated(step) }">{{ step }}</span>
                          <t-icon v-if="i < impact.chain.length - 1" name="chevron-right" />
                        </template>
                        <span v-if="!impact.chain.length" class="muted">范围内产品该主题未引用</span>
                      </td>
                      <td>
                        <t-tag v-for="name in impact.affectedProducts" :key="name" size="small"
                          :theme="impact.inScopeProducts.includes(name) ? 'primary' : 'default'" variant="light" class="mr4">
                          {{ name }}{{ impact.inScopeProducts.includes(name) ? ' ·范围内' : '' }}
                        </t-tag>
                        <span v-if="!impact.affectedProducts.length" class="muted">无</span>
                      </td>
                      <td>
                        <span v-if="impact.ratio !== undefined" :class="impact.contrastPass ? 'ratio-ok' : 'ratio-bad'">
                          {{ impact.ratio.toFixed(2) }}:1 {{ impact.contrastPass ? '✓' : '✗ 不达标' }}
                        </span>
                        <span v-else class="muted">—</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <!-- 并发待确认 -->
            <div v-if="store.pending.length" class="pending-box">
              <div class="batch-head"><div><strong>并发提交 · 待确认登记</strong><span>先落定映射已生效；后到内容按旧引用保留</span></div><t-tag theme="warning">待确认 {{ store.pending.length }}</t-tag></div>
              <div v-for="conflict of store.pending" :key="conflict.id" class="conflict-row">
                <div>
                  <t-tag size="small">{{ conflict.id }}</t-tag>
                  <p>{{ conflict.reason }}</p>
                  <small>{{ conflict.entries.map((entry) => `${entry.id}（${entry.batchId}）：${entry.oldTokenId} → ${entry.replacementTokenId}`).join('；') }}</small>
                </div>
                <div class="conflict-actions">
                  <t-button size="small" variant="outline" @click="conflict.entries.forEach((entry) => store.resolveConflicted(entry.id, 'arrival'))">采用后到内容（重新分析）</t-button>
                  <t-button size="small" theme="primary" @click="conflict.entries.forEach((entry) => store.resolveConflicted(entry.id, 'winner'))">确认先落定映射</t-button>
                </div>
              </div>
            </div>
          </div>
        </t-tab-panel>

        <!-- ② 令牌树与引用链 -->
        <t-tab-panel value="tree" label="② 令牌树与引用链">
          <div class="tab-inner">
            <div class="tree-legend">
              <span><i class="dot deprecated" /> 待下线旧令牌</span>
              <span><i class="dot migrated" /> 已完成迁移产品</span>
              <span><i class="dot legacy" /> 仍在旧引用</span>
              <span><i class="dot pending" /> 待确认</span>
            </div>

            <div v-for="token of store.deprecatedTokens" :key="token.id" class="tree-deprecated panel-inner">
              <div class="tree-token-head">
                <div><strong>{{ token.name }}</strong><code>{{ token.id }}</code></div>
                <div>
                  <t-tag v-if="store.treeView.get(token.id)?.replacementTokenId" size="small" theme="success" variant="light">
                    替代：{{ store.treeView.get(token.id)?.replacementTokenId }}
                  </t-tag>
                  <t-tag v-else size="small" variant="light">尚未登记替代关系</t-tag>
                </div>
              </div>
              <div class="tree-products">
                <template v-for="product of store.products" :key="product.id">
                  <span v-if="store.treeView.get(token.id)?.migratedProducts.includes(product.name)" class="pchip migrated">{{ product.name }} · 已完成</span>
                  <span v-else-if="store.treeView.get(token.id)?.pendingProducts.includes(product.name)" class="pchip pending">{{ product.name }} · 待确认</span>
                  <span v-else-if="[...(store.treeView.get(token.id)?.oldProducts ?? [])].includes(product.name)" class="pchip legacy">{{ product.name }} · 旧引用</span>
                </template>
                <span v-if="!store.treeView.has(token.id)" class="muted">四个产品均通过语义/组件别名间接引用此旧令牌。</span>
              </div>
            </div>

            <div class="chain-explorer panel-inner">
              <div class="chain-explorer-head">
                <strong>产品引用链解析</strong>
                <div>
                  <t-select :value="store.activeProductId" style="width: 150px" :options="productOptions" @change="(v: string) => store.setActiveProduct(v)" />
                  <t-select :value="store.activeTheme" style="width: 130px" :options="THEME_OPTIONS" @change="(v: string) => store.setActiveTheme(v)" />
                </div>
              </div>
              <div v-for="item in resolvedRoots" :key="item.root" class="chain-line">
                <div class="chain-steps">
                  <template v-for="(step, i) in item.result.chain" :key="i">
                    <span class="node-chip" :class="{ legacy: isDeprecated(step), migrated: migratedTargetIds.has(step) }">{{ step }}</span>
                    <t-icon v-if="i < item.result.chain.length - 1" name="chevron-right" />
                  </template>
                </div>
                <div class="chain-result">
                  <t-tag size="small" variant="light">解析值 {{ item.result.value }}</t-tag>
                  <t-tag v-if="item.result.dangling && item.result.compatibleFallback" size="small" theme="warning">旧稿缺替代关系 · 按原值兼容读取</t-tag>
                  <t-tag v-if="item.result.reachesDeprecated" size="small" theme="danger">引用链仍经过下线令牌</t-tag>
                  <t-tag v-else-if="!item.result.dangling" size="small" theme="success">已落到新版颜色</t-tag>
                </div>
              </div>
              <div class="chain-line compat-demo">
                <div class="chain-steps"><span class="node-chip legacy">color.legacy.unmapped</span></div>
                <div class="chain-result">
                  <t-tag size="small" variant="light">兼容值 {{ compatDemo.value }}</t-tag>
                  <t-tag size="small" theme="warning">旧稿无替代关系 · 原值兼容读取（不阻断渲染）</t-tag>
                </div>
              </div>
            </div>
          </div>
        </t-tab-panel>

        <!-- ③ 依赖图 -->
        <t-tab-panel value="graph" label="③ 依赖图">
          <div class="tab-inner">
            <div class="graph-toolbar">
              <div class="graph-legend2">
                <span><i class="edge normal" /> 普通引用</span>
                <span><i class="edge rerouted" /> 已改写（迁移生效）</span>
                <span><i class="edge legacyedge" /> 仍指向下线令牌</span>
                <span><i class="dot deprecated" /> 下线令牌节点</span>
              </div>
              <div>
                <t-select :value="store.activeProductId" style="width: 150px" :options="productOptions" @change="(v: string) => store.setActiveProduct(v)" />
                <t-select :value="store.activeTheme" style="width: 130px" :options="THEME_OPTIONS" @change="(v: string) => store.setActiveTheme(v)" />
              </div>
            </div>
            <svg class="mig-svg" viewBox="0 0 860 560" preserveAspectRatio="xMinYMid meet">
              <defs>
                <marker id="arrow-gray" markerWidth="8" markerHeight="8" refX="8" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8" fill="#8b9aa5" /></marker>
                <marker id="arrow-green" markerWidth="8" markerHeight="8" refX="8" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8" fill="#1f7a5c" /></marker>
                <marker id="arrow-red" markerWidth="8" markerHeight="8" refX="8" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8" fill="#c0492f" /></marker>
              </defs>
              <path v-for="(edge, i) in visibleEdges" :key="i" :d="edgePath(edge)" fill="none"
                :stroke="edge.kind === 'rerouted' ? '#1f7a5c' : edge.kind === 'legacy' ? '#c0492f' : '#8b9aa5'"
                :stroke-width="edge.kind === 'normal' ? 1.4 : 2.2"
                :stroke-dasharray="edge.kind === 'legacy' ? '5 4' : undefined"
                :marker-end="`url(#${edge.kind === 'rerouted' ? 'arrow-green' : edge.kind === 'legacy' ? 'arrow-red' : 'arrow-gray'})`" />
              <g v-for="layer in graphLayers" :key="layer[0]?.x ?? 0">
                <g v-for="node in layer" :key="node.id" :transform="`translate(${node.x},${node.y})`"
                  class="mig-node" :class="{ deprecated: node.status === 'deprecated', migrated: migratedTargetIds.has(node.id) }">
                  <rect x="-62" y="-24" width="124" height="48" rx="6" />
                  <text x="0" y="-4" text-anchor="middle">{{ node.name.length > 9 ? node.name.slice(0, 9) + '…' : node.name }}</text>
                  <text x="0" y="12" text-anchor="middle">{{ node.id.split('.').slice(-2).join('.') }}</text>
                </g>
              </g>
              <g :transform="`translate(${productPseudo.x},${productPseudo.y})`" class="mig-node product">
                <rect x="-58" y="-24" width="116" height="48" rx="6" />
                <text x="0" y="4" text-anchor="middle">{{ store.activeProduct?.name }}</text>
              </g>
            </svg>
            <p class="graph-note">当前视角：{{ store.activeProduct?.name }} · {{ THEME_OPTIONS.find((t) => t.value === store.activeTheme)?.label }}。绿色边代表该产品已按落定映射改写；红色虚线代表仍走旧引用。</p>
          </div>
        </t-tab-panel>

        <!-- ④ 发布门禁与快照 -->
        <t-tab-panel value="gate" label="④ 发布门禁与快照">
          <div class="tab-inner">
            <div class="gate-banner" :class="store.gateSummary.ready ? 'ready' : 'blocked'">
              <t-icon :name="store.gateSummary.ready ? 'check-circle' : 'error-circle'" :theme="store.gateSummary.ready ? 'success' : 'danger'" size="34px" />
              <div>
                <strong>{{ store.gateSummary.ready ? '门禁通过：可锁定本次颜色迁移发布' : '门禁未通过：仍存在阻断项' }}</strong>
                <span>产品迁移状态：{{ store.gateSummary.completedProducts }} 个完成 · {{ store.gateSummary.legacyProducts }} 个仍在旧引用 · {{ store.gateSummary.pendingProducts }} 个并发待确认</span>
              </div>
            </div>

            <table class="matrix-table">
              <thead>
                <tr><th>产品</th><th v-for="theme in THEME_OPTIONS" :key="theme.value">{{ theme.label }}</th><th>总体状态</th></tr>
              </thead>
              <tbody>
                <tr v-for="row of store.matrix" :key="row.product.id">
                  <td><strong>{{ row.product.name }}</strong></td>
                  <td v-for="cell of row.cells" :key="cell.theme">
                    <t-tag size="small" :theme="stateTheme[cell.state]" variant="light">{{ cell.state }}</t-tag>
                    <div v-if="cell.detail" class="cell-detail">{{ cell.detail }}</div>
                  </td>
                  <td><t-tag :theme="stateTheme[row.overall]" variant="light">{{ row.overall }}</t-tag></td>
                </tr>
              </tbody>
            </table>

            <div class="gate-checks">
              <div v-for="check in store.gateSummary.checks" :key="check.label" class="gate-check" :class="{ bad: !check.pass }">
                <t-icon :name="check.pass ? 'check-circle' : 'error-circle'" :theme="check.pass ? 'success' : 'danger'" />
                <div><strong>{{ check.label }}</strong><span>{{ check.detail }}</span></div>
              </div>
            </div>

            <div class="snapshot-box">
              <div class="batch-head"><div><strong>完整发布快照</strong><span>迁移写入失败后从上一个完整快照恢复</span></div><t-tag v-if="store.lastBatchResult" theme="primary">{{ store.lastBatchResult }}</t-tag></div>
              <div v-for="snapshot of [...store.snapshots].reverse()" :key="snapshot.id" class="snapshot-row">
                <t-tag size="small" :theme="snapshot.kind === 'release' ? 'default' : 'success'" variant="light">{{ snapshot.kind === 'release' ? '发布基线' : '迁移快照' }}</t-tag>
                <div class="snapshot-meta"><strong>{{ snapshot.label }}</strong><span>{{ snapshot.id }} · {{ new Date(snapshot.createdAt).toLocaleString('zh-CN') }}</span></div>
                <t-button size="small" variant="outline" :disabled="snapshot.id === store.lastSnapshot?.id" @click="store.restoreFrom(snapshot)">恢复到此快照</t-button>
              </div>
            </div>
          </div>
        </t-tab-panel>
      </t-tabs>

      <aside class="mig-rail">
        <div class="panel rail-card">
          <div class="rail-head"><strong>产品迁移总览</strong></div>
          <div v-for="row of store.matrix" :key="row.product.id" class="rail-product">
            <div class="rail-product-name"><span>{{ row.product.name }}</span><t-tag size="small" :theme="stateTheme[row.overall]" variant="light">{{ row.overall }}</t-tag></div>
            <div class="rail-dots">
              <span v-for="cell in row.cells" :key="cell.theme" class="rail-dot" :class="cell.state" :title="`${cell.theme}：${cell.state}${cell.detail ? ' · ' + cell.detail : ''}`">{{ cell.theme.slice(0, 1) }}</span>
            </div>
          </div>
        </div>
        <div class="panel rail-card rail-log">
          <div class="rail-head"><strong>操作 / 仲裁日志</strong></div>
          <div v-for="(line, i) in store.logs" :key="i" class="log-line" :class="line.tone">
            <time>{{ line.time }}</time><p>{{ line.text }}</p>
          </div>
        </div>
      </aside>
    </div>

    <t-dialog v-model:visible="registerDialog" header="登记颜色令牌迁移" :confirm-btn="{ content: '登记并提交门禁', onClick: submitRegister }" :cancel-btn="{ content: '取消' }">
      <div class="dialog-form">
        <label><span>待下线旧令牌</span>
          <t-select v-model="form.oldTokenId" :options="store.deprecatedTokens.map((t) => ({ label: `${t.name}（${t.id}）`, value: t.id }))" />
        </label>
        <label><span>替代令牌</span>
          <t-select v-model="form.replacementValue" filterable :options="replacementOptions" />
        </label>
        <label><span>迁移范围（产品）</span>
          <t-select v-model="form.scope" multiple :options="productOptions" placeholder="选择受影响产品" />
        </label>
        <label><span>备注</span>
          <t-textarea v-model="form.note" :autosize="{ minRows: 2 }" placeholder="可选" />
        </label>
      </div>
    </t-dialog>
  </div>
</template>

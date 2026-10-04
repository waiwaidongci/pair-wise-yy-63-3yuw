<script setup lang="ts">
import { computed, h, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuery, useMutation } from '@tanstack/vue-query';
import { MessagePlugin } from 'tdesign-vue-next';
import {
  AddIcon,
  ArrowRightIcon,
  CopyIcon,
  HistoryIcon,
  LockOnIcon,
  RefreshIcon,
  SearchIcon,
  SwapIcon
} from 'tdesign-icons-vue-next';
import TokenEditor from './components/TokenEditor.vue';
import { fetchTokens, submitRelease, type Token } from './api';
import { useTokenStore } from './store';

const AddButtonIcon = () => h(AddIcon);
const ArrowRightButtonIcon = () => h(ArrowRightIcon);
const CopyButtonIcon = () => h(CopyIcon);
const HistoryButtonIcon = () => h(HistoryIcon);
const LockButtonIcon = () => h(LockOnIcon);
const RefreshButtonIcon = () => h(RefreshIcon);
const SearchInputIcon = () => h(SearchIcon);
const SwapButtonIcon = () => h(SwapIcon);

const route = useRoute();
const router = useRouter();
const store = useTokenStore();
const { data: remote } = useQuery({ queryKey: ['tokens'], queryFn: fetchTokens });
const selectedVersion = ref(store.releaseVersion);
const batchFrom = ref('');
const batchTo = ref('');
const releaseDialog = ref(false);
const newTokenDialog = ref(false);
const newToken = ref({ id: '', name: '', category: 'color', value: '#2864dc', description: '' });
const releaseResult = ref('');
const migrationDialog = ref(false);
const newMigration = ref({ title: '', oldTokenId: '', newTokenId: '', productIds: [] as string[], themes: [] as string[] });
const selectedOldTokenId = ref('color.base.blue.600');
const migrationMessage = ref('');

const themeOptions = [
  { label: '明亮模式', value: 'light' },
  { label: '暗色模式', value: 'dark' },
  { label: '运营模式', value: 'ops' },
  { label: '高对比度', value: 'contrast' }
];
const productOptions = store.products.map((product) => ({ label: product.name, value: product.id }));

const selectedBatch = computed(() => store.migrationBatches.find((batch) => batch.id === store.selectedBatchId));
const affectedProducts = computed(() => store.affectedProductsFor(selectedOldTokenId.value));
const migrationStatusOfSelected = computed(() => store.productMigrationStatus);
const gateFailures = computed(() => store.migrationGateFailures);
const gatePass = computed(() => store.migrationGatePass);

const nav = [
  { path: '/', label: '令牌工作区', icon: 'token' },
  { path: '/graph', label: '依赖与校验', icon: 'control-platform' },
  { path: '/migration', label: '迁移下线', icon: 'swap' },
  { path: '/review', label: '变更评审', icon: 'git-commit' },
  { path: '/publish', label: '主题发布', icon: 'send' }
];

const pageTitle = computed(() => nav.find((item) => item.path === route.path)?.label ?? '令牌工作区');
const selected = computed<Token | undefined>(() => store.selectedToken);
const selectedJson = computed(() => selected.value ? JSON.stringify({
  id: selected.value.id,
  name: selected.value.name,
  category: selected.value.category,
  value: selected.value.value,
  ref: selected.value.ref,
  themes: selected.value.themes,
  description: selected.value.description,
  status: selected.value.status
}, null, 2) : '{}');
const categories = computed(() => ['全部', ...new Set(store.tokens.map((token) => token.category))]);
const graphNodes = computed(() => {
  const nodes = store.tokens.filter((token) => token.ref || store.tokens.some((item) => item.ref === token.id));
  const grouped = ['color', 'font', 'spacing', 'radius', 'shadow', 'component'];
  return nodes.map((token, index) => ({
    ...token,
    x: 80 + grouped.indexOf(token.category) * 150,
    y: 70 + (index % 4) * 105
  }));
});
const graphEdges = computed(() => store.dependencyEdges.map((edge) => {
  const from = graphNodes.value.find((node) => node.id === edge.from);
  const to = graphNodes.value.find((node) => node.id === edge.to);
  return from && to ? { ...edge, from, to } : null;
}).filter(Boolean) as { from: Token & {x:number;y:number}; to: Token & {x:number;y:number} }[]);
const graphMigrationEdges = computed(() => store.migrationEdges.map((edge) => {
  const from = graphNodes.value.find((node) => node.id === edge.from);
  const to = graphNodes.value.find((node) => node.id === edge.to);
  return from && to ? { ...edge, from, to } : null;
}).filter(Boolean) as { from: Token & {x:number;y:number}; to: Token & {x:number;y:number}; status: MigrationStatus }[]);

type MigrationStatus = '待校验' | '可处理' | '已暂停' | '已落定' | '待确认';

function nodeGraphStatus(token: Token): 'deprecated' | 'old-ref' | 'normal' {
  if (token.status === 'deprecated') return 'deprecated';
  const deprecatedIds = new Set(store.deprecatedTokens.map((item) => item.id));
  if (!deprecatedIds.size) return 'normal';
  if (token.ref && deprecatedIds.has(token.ref)) return 'old-ref';
  const themeRefs = Object.values(token.themes).filter((value) => value.startsWith('{') && value.endsWith('}')).map((value) => value.slice(1, -1));
  if (themeRefs.some((ref) => deprecatedIds.has(ref))) return 'old-ref';
  return 'normal';
}

const releaseMutation = useMutation({
  mutationFn: (payload: { version: string; accepted: string[]; actor: string }) => submitRelease(payload),
  onSuccess: (data) => {
    releaseResult.value = `发布标识 ${data.releaseId} · ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
    MessagePlugin.success('主题版本已锁定并生成发布记录');
  }
});

watch(remote, (value) => {
  if (value && !store.tokens.length) value.tokens.forEach((token) => store.addToken(token));
});

function go(path: string) {
  router.push(path);
}

function updateEditor(value: string) {
  try {
    const parsed = JSON.parse(value) as Partial<Token>;
    if (parsed.value !== undefined) store.updateTokenValue(store.selectedTokenId, parsed.value);
  } catch {
    // Keep invalid JSON editable; validation is shown in the dependency panel.
  }
}

function addToken() {
  if (!newToken.value.id || !store.tokens.every((token) => token.id !== newToken.value.id)) {
    MessagePlugin.error('令牌 ID 不能为空且不能重复');
    return;
  }
  store.addToken({
    id: newToken.value.id,
    name: newToken.value.name || newToken.value.id,
    category: newToken.value.category as Token['category'],
    value: newToken.value.value,
    themes: { light: newToken.value.value, dark: newToken.value.value, ops: newToken.value.value, contrast: newToken.value.value },
    usage: 0,
    status: 'proposed',
    description: newToken.value.description
  });
  store.selectToken(newToken.value.id);
  newTokenDialog.value = false;
  newToken.value = { id: '', name: '', category: 'color', value: '#2864dc', description: '' };
  MessagePlugin.success('已创建候选令牌');
}

function batchReplace() {
  if (!batchFrom.value || !batchTo.value) return;
  let count = 0;
  store.tokens.forEach((token) => {
    Object.keys(token.themes).forEach((theme) => {
      if (token.themes[theme] === batchFrom.value) {
        token.themes[theme] = batchTo.value;
        count += 1;
      }
    });
    if (token.value === batchFrom.value) {
      token.value = batchTo.value;
      count += 1;
    }
  });
  store.persist();
  MessagePlugin.success(`已替换 ${count} 处引用`);
}

function publish() {
  const accepted = store.changes.filter((item) => item.status === '已接受').map((item) => item.id);
  releaseMutation.mutate({ version: selectedVersion.value, accepted, actor: '设计系统维护员' });
  store.lockRelease();
  releaseDialog.value = true;
}

function productName(id: string) {
  return store.products.find((product) => product.id === id)?.name ?? id;
}

function mappingStatusTheme(status: string) {
  if (status === '已落定') return 'success';
  if (status === '可处理') return 'primary';
  if (status === '已暂停') return 'danger';
  if (status === '待确认') return 'warning';
  return 'default';
}

function openMigrationDialog() {
  newMigration.value = { title: '', oldTokenId: '', newTokenId: '', productIds: store.products.map((p) => p.id), themes: ['light', 'dark', 'ops', 'contrast'] };
  migrationDialog.value = true;
}

function registerMigration() {
  if (!newMigration.value.oldTokenId || !newMigration.value.newTokenId) {
    MessagePlugin.error('请填写旧令牌与替代令牌');
    return;
  }
  if (!newMigration.value.productIds.length || !newMigration.value.themes.length) {
    MessagePlugin.error('请选择迁移范围（产品与主题）');
    return;
  }
  const title = newMigration.value.title || `迁移 ${newMigration.value.oldTokenId}`;
  const batchId = store.registerMigrationBatch(title, [{
    oldTokenId: newMigration.value.oldTokenId,
    newTokenId: newMigration.value.newTokenId,
    productIds: newMigration.value.productIds,
    themes: newMigration.value.themes
  }]);
  store.selectedBatchId = batchId;
  migrationDialog.value = false;
  migrationMessage.value = '迁移已登记，正在按引用链计算受影响产品…';
  MessagePlugin.success('迁移已登记');
}

function validateAll() {
  store.migrationBatches.forEach((batch) => {
    if (batch.status === '草稿') store.validateBatch(batch.id);
  });
  migrationMessage.value = '已完成引用链校验与替代关系检查';
  MessagePlugin.success('校验完成');
}

function applyAllProcessable() {
  store.migrationBatches.forEach((batch) => {
    if (batch.status === '已校验' || batch.status === '部分落定') {
      batch.baseVersion = store.migrationVersion;
      store.commitBatch(batch.id);
    }
  });
  migrationMessage.value = '已应用所有可处理迁移项';
  MessagePlugin.success('可处理项已落定');
}

function simulateConcurrent() {
  const { batchA, batchB } = store.simulateConcurrentSubmit();
  store.selectedBatchId = batchB;
  migrationMessage.value = '两个标签页同时提交：标签页 A 先落定生效，标签页 B 按旧引用保留并登记待确认';
  MessagePlugin.warning('并发迁移：后到内容已登记待确认');
}

function simulateFailure() {
  const { result } = store.simulateWriteFailure();
  migrationMessage.value = result.reason;
  MessagePlugin.error(result.reason);
}

function readCompatible() {
  store.readCompatibleDraft();
  migrationMessage.value = '旧稿无替代关系，已按原值兼容读取 ' + store.tokens.length + ' 个令牌';
  MessagePlugin.success('已按原值兼容读取旧稿');
}
</script>

<template>
  <t-layout class="app-shell">
    <t-header class="app-header">
      <div class="brand"><span class="brand-mark">DS</span><div><strong>设计令牌治理台</strong><small>Cross-product Token Governance</small></div></div>
      <div class="release-chip"><span>当前候选</span><strong>DS {{ store.releaseVersion }}</strong></div>
      <div class="header-spacer" />
      <t-tag theme="success" variant="light-outline">校验通过 {{ store.releaseReadiness }}%</t-tag>
      <div class="operator"><span>设计系统维护员</span><strong>顾清 · Core DS</strong></div>
    </t-header>
    <t-layout class="body-layout">
      <t-aside class="side-nav">
        <div class="workspace-card"><t-icon name="layers" /><div><span>当前工作区</span><strong>通用组件库 · 品牌主题</strong><small>15 个令牌 · 4 个主题变体</small></div></div>
        <nav><button v-for="item in nav" :key="item.path" :class="{ active: route.path === item.path }" @click="go(item.path)"><t-icon :name="item.icon" /><span>{{ item.label }}</span><t-badge v-if="item.path === '/review'" :count="store.changes.filter(c => c.status === '待评审').length" /></button></nav>
        <div class="save-state"><t-icon name="cloud-done" /><div><span>草稿已保存</span><small>{{ new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) }}</small></div></div>
      </t-aside>
      <t-content class="main-content">
        <header class="page-heading">
          <div><small>{{ store.locked ? 'RELEASE LOCKED' : 'GOVERNANCE WORKBENCH' }} / {{ pageTitle }}</small><h1>{{ pageTitle }}</h1><p>基础令牌到语义令牌的引用、差异、校验与跨主题发布。</p></div>
          <div class="heading-actions"><t-select v-model="store.activeTheme" style="width: 150px" :options="[{label:'明亮模式',value:'light'},{label:'暗色模式',value:'dark'},{label:'运营模式',value:'ops'},{label:'高对比度',value:'contrast'}]" /><t-button variant="outline" :icon="AddButtonIcon" @click="newTokenDialog = true">新建令牌</t-button><t-button theme="primary" :icon="LockButtonIcon" :disabled="store.locked" @click="publish">发布主题</t-button></div>
        </header>

        <section v-if="route.path === '/'" class="token-workspace">
          <aside class="token-tree panel">
            <div class="panel-head"><div><strong>令牌树</strong><span>{{ store.filteredTokens.length }} 个匹配项</span></div><t-button size="small" variant="text" :icon="RefreshButtonIcon" @click="store.rollback">回滚</t-button></div>
            <t-input v-model="store.search" clearable placeholder="搜索令牌 ID 或名称" :prefix-icon="SearchInputIcon" />
            <div class="category-tabs"><button v-for="category in categories" :key="category" :class="{ active: store.category === category }" @click="store.setCategory(category)">{{ category }}</button></div>
            <div class="tree-list">
              <button v-for="token in store.filteredTokens" :key="token.id" :class="{ active: store.selectedTokenId === token.id, deprecated: token.status === 'deprecated' }" @click="store.selectToken(token.id)">
                <i :class="token.category" />
                <div><strong>{{ token.name }}</strong><span>{{ token.id }}</span></div>
                <t-tag size="small" :theme="token.status === 'stable' ? 'success' : token.status === 'proposed' ? 'warning' : 'danger'" variant="light">{{ token.status === 'stable' ? '稳定' : token.status === 'proposed' ? '候选' : '已下线' }}</t-tag>
              </button>
            </div>
          </aside>
          <section class="editor-column">
            <div class="panel editor-panel">
              <div class="panel-head"><div><strong>Monaco 令牌编辑</strong><span>{{ selected?.id }} · {{ store.activeTheme }}</span></div><div class="editor-actions"><t-tag v-if="selected?.ref" variant="light">引用 {{ selected.ref }}</t-tag><t-button size="small" variant="outline" :icon="CopyButtonIcon">复制 JSON</t-button></div></div>
              <div class="editor-host"><TokenEditor :model-value="selectedJson" language="json" @update:model-value="updateEditor" /></div>
              <div class="editor-status"><span><i class="status-dot" />JSON 结构有效</span><span>引用关系 {{ store.dependencyEdges.length }} 条</span><span>{{ selected?.usage }} 处产品引用</span></div>
            </div>
            <div class="panel batch-panel"><div class="panel-head"><div><strong>批量替换</strong><span>跨主题替换相同原始值</span></div><SwapIcon /></div><div class="batch-form"><t-input v-model="batchFrom" placeholder="原始值，如 #2864dc" /><ArrowRightIcon /><t-input v-model="batchTo" placeholder="新值" /><t-button theme="primary" :disabled="!batchFrom || !batchTo" @click="batchReplace">执行替换</t-button></div></div>
          </section>
          <aside class="preview-column">
            <div class="panel preview-panel">
              <div class="panel-head"><div><strong>组件预览</strong><span>实时应用当前主题</span></div><t-tag theme="success" variant="light">可渲染</t-tag></div>
              <div class="component-preview" :style="{ background: selected?.category === 'color' ? selected.value : undefined }">
                <div class="mock-app"><div class="mock-sidebar"><i /><i /><i /></div><div class="mock-content"><div class="mock-title" /><div class="mock-card"><span /><span /><span /></div><div class="mock-buttons"><button>取消</button><button>确认提交</button></div></div></div>
              </div>
              <div class="token-detail"><div><span>当前值</span><strong>{{ selected?.value }}</strong></div><div><span>使用量</span><strong>{{ selected?.usage }} 处</strong></div><div><span>状态</span><strong>{{ selected?.status }}</strong></div><div><span>说明</span><strong>{{ selected?.description }}</strong></div></div>
            </div>
            <div class="panel validation-summary"><div class="panel-head"><div><strong>快速校验</strong><span>发布前门禁摘要</span></div><strong class="score">{{ store.releaseReadiness }}%</strong></div><div class="summary-row" :class="{ bad: store.cycleNodes.length }"><span>循环依赖</span><strong>{{ store.cycleNodes.length ? `${store.cycleNodes.length} 个节点` : '未发现' }}</strong></div><div class="summary-row" :class="{ bad: store.invalidReferences.length }"><span>无效引用</span><strong>{{ store.invalidReferences.length || '未发现' }}</strong></div><div class="summary-row" :class="{ bad: store.contrastIssues.length }"><span>对比度</span><strong>{{ store.contrastIssues.length ? '需调整' : '符合 AA' }}</strong></div><div class="summary-row"><span>命名冲突</span><strong>未发现</strong></div></div>
          </aside>
        </section>

        <section v-else-if="route.path === '/graph'" class="graph-page panel">
          <div class="panel-head"><div><strong>令牌依赖图</strong><span>基础令牌 → 语义令牌 → 组件别名</span></div><div class="graph-legend"><span><i class="color" />颜色</span><span><i class="component" />组件</span><span><i class="error" />错误</span><span><i class="mig" />迁移映射</span><span><i class="old-ref" />仍在旧引用</span><span><i class="deprecated" />已下线</span></div></div>
          <div class="graph-canvas">
            <svg viewBox="0 0 820 520" preserveAspectRatio="xMidYMid meet">
              <defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="8" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8" fill="#7c8c98" /></marker><marker id="arrow-mig" markerWidth="8" markerHeight="8" refX="8" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8" fill="#e8930c" /></marker></defs>
              <path v-for="edge in graphEdges" :key="`${edge.from.id}-${edge.to.id}`" :d="`M ${edge.from.x} ${edge.from.y} C ${edge.from.x + 70} ${edge.from.y}, ${edge.to.x - 70} ${edge.to.y}, ${edge.to.x} ${edge.to.y}`" fill="none" stroke="#8b9aa5" stroke-width="1.5" marker-end="url(#arrow)" />
              <path v-for="edge in graphMigrationEdges" :key="`mig-${edge.from.id}-${edge.to.id}`" :d="`M ${edge.from.x} ${edge.from.y - 14} C ${edge.from.x + 90} ${edge.from.y - 40}, ${edge.to.x - 90} ${edge.to.y - 40}, ${edge.to.x} ${edge.to.y - 14}`" fill="none" stroke="#e8930c" stroke-width="1.8" stroke-dasharray="6 4" marker-end="url(#arrow-mig)" />
              <g v-for="node in graphNodes" :key="node.id" :transform="`translate(${node.x},${node.y})`" class="graph-node" :class="[nodeGraphStatus(node), { cycle: store.cycleNodes.includes(node.id), selected: node.id === store.selectedTokenId }]" @click="store.selectToken(node.id)">
                <rect x="-60" y="-24" width="120" height="48" rx="5" />
                <text x="0" y="-3" text-anchor="middle">{{ node.name }}</text>
                <text x="0" y="13" text-anchor="middle">{{ node.status === 'deprecated' ? '已下线' : node.category }}</text>
              </g>
            </svg>
          </div>
          <div class="validation-strip"><div class="validation-card"><t-icon name="check-circle" theme="success" /><div><strong>循环依赖</strong><span>{{ store.cycleNodes.length ? store.cycleNodes.join(' → ') : '未发现循环引用路径' }}</span></div></div><div class="validation-card"><t-icon :name="store.invalidReferences.length ? 'error-circle' : 'check-circle'" :theme="store.invalidReferences.length ? 'danger' : 'success'" /><div><strong>引用完整性</strong><span>{{ store.invalidReferences.length ? store.invalidReferences.map(t => t.ref).join('、') : '所有引用均指向已发布令牌' }}</span></div></div><div class="validation-card"><t-icon :name="store.contrastIssues.length ? 'error-circle' : 'check-circle'" :theme="store.contrastIssues.length ? 'danger' : 'success'" /><div><strong>对比度检查</strong><span>{{ store.contrastIssues[0]?.detail ?? '正文与背景对比度 13.8:1' }}</span></div></div></div>
        </section>

        <section v-else-if="route.path === '/migration'" class="migration-page">
          <div class="panel migration-toolbar">
            <div class="toolbar-head"><div><strong>令牌迁移下线</strong><span>登记旧令牌与替代令牌，按引用链评估受影响产品，校验替代关系后分批落定</span></div></div>
            <div class="toolbar-actions">
              <t-button variant="outline" icon="add" @click="openMigrationDialog">登记迁移</t-button>
              <t-button variant="outline" icon="check" @click="validateAll">校验全部</t-button>
              <t-button theme="primary" icon="check-circle" @click="applyAllProcessable">应用可处理项</t-button>
              <t-button variant="outline" icon="swap" @click="simulateConcurrent">模拟两标签页同时提交</t-button>
              <t-button variant="outline" icon="refresh" @click="simulateFailure">模拟写入失败</t-button>
              <t-button variant="text" icon="history" @click="readCompatible">读取旧稿（无替代关系）</t-button>
            </div>
            <div v-if="migrationMessage" class="toolbar-note"><t-icon name="info-circle" /><span>{{ migrationMessage }}</span></div>
          </div>

          <div class="migration-grid">
            <div class="migration-col">
              <div class="panel">
                <div class="panel-head"><div><strong>迁移批次</strong><span>{{ store.migrationBatches.length }} 个批次 · 版本 v{{ store.migrationVersion }}</span></div><t-tag v-if="store.migrationLocked" theme="warning" variant="light-outline">写入中</t-tag></div>
                <div class="batch-list">
                  <button v-for="batch in store.migrationBatches" :key="batch.id" :class="{ active: store.selectedBatchId === batch.id }" @click="store.selectedBatchId = batch.id">
                    <div class="batch-row"><strong>{{ batch.title }}</strong><t-tag size="small" :theme="batch.status === '已全部落定' ? 'success' : batch.status === '部分落定' ? 'primary' : batch.status === '已回滚' ? 'danger' : batch.status === '待确认' ? 'warning' : 'default'" variant="light">{{ batch.status }}</t-tag></div>
                    <span>{{ batch.mappings.length }} 项映射 · v{{ batch.baseVersion }} → v{{ store.migrationVersion }}</span>
                  </button>
                </div>
              </div>

              <div class="panel">
                <div class="panel-head"><div><strong>映射明细</strong><span>{{ selectedBatch?.title }}</span></div></div>
                <div class="mapping-list">
                  <div v-for="mapping in selectedBatch?.mappings ?? []" :key="mapping.id" class="mapping-card">
                    <div class="mapping-flow"><code>{{ mapping.oldTokenId }}</code><t-icon name="arrow-right" /><code>{{ mapping.newTokenId }}</code><t-tag size="small" :theme="mappingStatusTheme(mapping.status)" variant="light">{{ mapping.status }}</t-tag></div>
                    <div class="mapping-scope"><span v-for="pid in mapping.scope.productIds" :key="pid" class="scope-chip">{{ productName(pid) }}</span><span v-for="theme in mapping.scope.themes" :key="theme" class="scope-chip theme">{{ theme }}</span></div>
                    <p v-if="mapping.pauseReason" class="pause-reason"><t-icon name="error-circle" /><strong>{{ mapping.pauseReason }}</strong><span>{{ mapping.pauseDetail }}</span></p>
                    <p v-if="mapping.settledAt" class="settled-note"><t-icon name="check-circle" />已于 {{ new Date(mapping.settledAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) }} 落定</p>
                  </div>
                  <p v-if="!selectedBatch?.mappings.length" class="empty">暂无映射，请先登记迁移。</p>
                </div>
              </div>
            </div>

            <div class="migration-col">
              <div class="panel">
                <div class="panel-head"><div><strong>引用链影响分析</strong><span>按主题解析 {{ selectedOldTokenId }} 的引用链</span></div></div>
                <div class="analysis-form"><label><span>旧令牌</span><t-select v-model="selectedOldTokenId" :options="store.tokens.map(t => ({ label: `${t.name}（${t.id}）`, value: t.id }))" /></label></div>
                <div class="affected-grid">
                  <div v-for="(products, theme) in affectedProducts" :key="theme" class="affected-card">
                    <strong>{{ theme }}</strong>
                    <div class="affected-products">
                      <span v-for="pid in products" :key="pid" class="affected-chip">{{ productName(pid) }}</span>
                      <span v-if="!products.length" class="empty">无受影响产品</span>
                    </div>
                  </div>
                </div>
              </div>

              <div class="panel">
                <div class="panel-head"><div><strong>下线清理门禁</strong><span>产品是否仍引用已下线令牌</span></div><t-tag :theme="gatePass ? 'success' : 'danger'" variant="light">{{ gatePass ? '全部迁移完成' : `${gateFailures.length} 个产品仍在旧引用` }}</t-tag></div>
                <div class="gate-list">
                  <div v-for="product in store.products" :key="product.id" class="gate-row">
                    <strong>{{ product.name }}</strong>
                    <t-tag size="small" :theme="migrationStatusOfSelected[product.id]?.status === '已迁移' ? 'success' : 'danger'" variant="light">{{ migrationStatusOfSelected[product.id]?.status ?? '已迁移' }}</t-tag>
                    <span v-if="migrationStatusOfSelected[product.id]?.refs.length" class="gate-refs">仍引用：{{ migrationStatusOfSelected[product.id].refs.join('、') }}</span>
                  </div>
                </div>
              </div>

              <div class="panel">
                <div class="panel-head"><div><strong>待确认登记</strong><span>并发冲突或校验未通过、等待人工确认的映射</span></div></div>
                <div class="pending-list">
                  <div v-for="mapping in store.pendingConfirmations" :key="mapping.id" class="pending-row">
                    <code>{{ mapping.oldTokenId }}</code><t-icon name="arrow-right" /><code>{{ mapping.newTokenId }}</code><t-tag size="small" theme="warning" variant="light">{{ mapping.status }}</t-tag>
                  </div>
                  <p v-if="!store.pendingConfirmations.length" class="empty">暂无待确认项。</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section v-else-if="route.path === '/review'" class="review-page">
          <div class="review-summary panel"><div><span>待评审变更</span><strong>{{ store.changes.filter(c => c.status === '待评审').length }}</strong></div><div><span>已接受</span><strong>{{ store.changes.filter(c => c.status === '已接受').length }}</strong></div><div><span>已退回</span><strong>{{ store.changes.filter(c => c.status === '已退回').length }}</strong></div><div><span>受影响组件</span><strong>48</strong></div></div>
          <div class="review-grid">
            <div v-for="change in store.changes" :key="change.id" class="panel change-card">
              <div class="change-head"><div><t-tag size="small">{{ change.id }}</t-tag><strong>{{ change.title }}</strong><span>{{ change.requester }} · {{ change.scope }}</span></div><t-tag :theme="change.status === '已接受' ? 'success' : change.status === '已退回' ? 'danger' : 'warning'" variant="light">{{ change.status }}</t-tag></div>
              <div class="diff-box"><div><span>修改前</span><code>{{ change.diff.before }}</code></div><t-icon name="arrow-right" /><div><span>修改后</span><code>{{ change.diff.after }}</code></div></div>
              <div class="impact"><span>影响评分</span><t-progress :percentage="change.impact" :theme="change.impact > 70 ? 'danger' : 'warning'" /></div>
              <div class="change-actions"><t-button variant="outline" :disabled="change.status !== '待评审'" @click="store.rejectChange(change.id)">退回并说明</t-button><t-button theme="primary" :disabled="change.status !== '待评审'" @click="store.acceptChange(change.id)">接受变更</t-button></div>
            </div>
          </div>
        </section>

        <section v-else class="publish-page">
          <div class="panel publish-main">
            <div class="panel-head"><div><strong>发布准备</strong><span>生成只读版本，支持回滚到历史基线</span></div><t-tag :theme="store.locked ? 'success' : 'warning'">{{ store.locked ? '已锁定' : '候选版本' }}</t-tag></div>
            <div class="publish-form">
              <label><span>版本号</span><t-input v-model="selectedVersion" /></label>
              <label><span>目标产品</span><t-select multiple value="['组件库','运营后台','移动端组件']" :options="[{label:'组件库',value:'组件库'},{label:'运营后台',value:'运营后台'},{label:'移动端组件',value:'移动端组件'},{label:'数据平台',value:'数据平台'}]" /></label>
              <label><span>发布说明</span><t-textarea value="更新语义主色、统一控件圆角，并修复暗色主题正文对比度。" :autosize="{ minRows: 3 }" /></label>
            </div>
            <div class="release-checks">
              <label><t-checkbox checked /> 循环依赖检查通过</label>
              <label><t-checkbox checked /> 无效引用检查通过</label>
              <label><t-checkbox :checked="store.contrastIssues.length === 0" /> 颜色对比度符合 WCAG AA</label>
              <label><t-checkbox :checked="store.changes.every(c => c.status !== '待评审')" /> 所有变更请求已处理</label>
              <label><t-checkbox :checked="gatePass" /> 下线令牌已无产品引用（{{ gateFailures.length }} 个产品仍在旧引用）</label>
            </div>
            <div class="publish-actions"><t-button variant="outline" @click="store.rollback">回滚全部未发布编辑</t-button><t-button theme="primary" icon="lock-on" :disabled="store.locked || store.changes.some(c => c.status === '待评审') || !gatePass" @click="publish">校验并锁定发布</t-button></div>
          </div>
          <aside class="publish-side">
            <div class="panel diff-panel"><div class="panel-head"><div><strong>版本差异</strong><span>相对 {{ store.lastPublished }}</span></div><t-tag>{{ store.diffRows.length }} 项</t-tag></div><div v-for="row in store.diffRows" :key="row.id" class="diff-row"><strong>{{ row.name }}</strong><span>{{ row.id }}</span><div><del>{{ row.before }}</del><ins>{{ row.after }}</ins></div></div><p v-if="!store.diffRows.length" class="empty">暂无未发布差异。</p></div>
            <div class="panel history-panel"><div class="panel-head"><div><strong>发布历史</strong><span>可追溯版本</span></div><HistoryIcon /></div><div class="history-row"><t-tag theme="success" variant="light">当前</t-tag><div><strong>DS {{ store.lastPublished }}</strong><span>顾清 · 09-24 17:20</span></div><t-button size="small" variant="text">查看</t-button></div><div class="history-row"><t-tag>历史</t-tag><div><strong>DS 4.5.1</strong><span>周序 · 09-12 11:04</span></div><t-button size="small" variant="text">回滚</t-button></div><div class="history-row"><t-tag>历史</t-tag><div><strong>DS 4.5.0</strong><span>顾清 · 08-28 15:42</span></div><t-button size="small" variant="text">回滚</t-button></div></div>
          </aside>
        </section>
      </t-content>
    </t-layout>
  </t-layout>

  <t-dialog v-model:visible="newTokenDialog" header="创建候选令牌" :confirm-btn="{ content: '创建', onClick: addToken }">
    <div class="dialog-form"><t-input v-model="newToken.id" label="令牌 ID" placeholder="product.component.property" /><t-input v-model="newToken.name" label="显示名称" /><t-select v-model="newToken.category" label="分类" :options="[{label:'颜色',value:'color'},{label:'字体',value:'font'},{label:'间距',value:'spacing'},{label:'圆角',value:'radius'},{label:'阴影',value:'shadow'},{label:'组件',value:'component'}]" /><t-input v-model="newToken.value" label="默认值" /><t-textarea v-model="newToken.description" label="用途说明" /></div>
  </t-dialog>
  <t-dialog v-model:visible="releaseDialog" header="主题发布完成" :footer="false"><div class="release-success"><t-icon name="check-circle" size="46px" theme="success" /><h3>DS {{ store.releaseVersion }} 已锁定</h3><p>{{ releaseResult }}</p><p>版本快照已生成，产品使用方可以按固定版本拉取令牌。</p></div></t-dialog>

  <t-dialog v-model:visible="migrationDialog" header="登记迁移下线" :confirm-btn="{ content: '登记并校验', onClick: registerMigration }">
    <div class="dialog-form">
      <t-input v-model="newMigration.title" label="批次标题" placeholder="如：下线旧品牌色" />
      <t-select v-model="newMigration.oldTokenId" label="旧令牌（待下线）" :options="store.tokens.map(t => ({ label: `${t.name}（${t.id}）`, value: t.id }))" />
      <t-select v-model="newMigration.newTokenId" label="替代令牌" :options="store.tokens.map(t => ({ label: `${t.name}（${t.id}）`, value: t.id }))" />
      <t-select v-model="newMigration.productIds" label="迁移范围（产品）" multiple :options="productOptions" />
      <t-select v-model="newMigration.themes" label="迁移范围（主题）" multiple :options="themeOptions" />
    </div>
  </t-dialog>
</template>

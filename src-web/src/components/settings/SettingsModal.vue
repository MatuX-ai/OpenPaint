<!--
  设置对话框（覆盖在主界面之上）。

  MVP 仅暴露 LLM Provider 配置：
    - 选择 Provider（OpenAI / Anthropic / DeepSeek / Ollama）
    - 填入 API Key（Ollama 不需要）
    - 选择默认 Model（按 provider 给出建议）
    - 调整 Endpoint（可选，使用默认端点时留空）

  保存后调用后端 llmApi.setProvider + setApiKey，
  并通过 useLlmConfig.refresh() 通知 AI 助理面板重新检查 ready 状态。
-->

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { X, Save, RotateCcw, Eye, EyeOff } from 'lucide-vue-next';
import { useUIStore } from '@stores/uiStore';
import { useLlmConfig } from '@composables/useLlmConfig';
import { llmApi } from '@api/index';
import type { LlmProviderId, LlmProviderInfo } from '@api/index';

const uiStore = useUIStore();
const { providerConfig, refresh: refreshLlm } = useLlmConfig();

const visible = computed(() => uiStore.settingsModalVisible);
const llmHighlight = computed(() => uiStore.llmSettingsHighlight);

const providers = ref<LlmProviderInfo[]>([]);
const loadingProviders = ref(false);
// 默认选中 DeepSeek：与后端 list_providers 的“国内优先”顺序保持一致，
// 减少国内用户首次打开设置面板时的额外点击。用户在弹窗加载完成后会被实际
// 保存在配置文件中的设置覆盖。
const currentProvider = ref<LlmProviderId>('deepseek');
const showKey = ref(false);
const saving = ref(false);
const errorMsg = ref('');
const successMsg = ref('');

interface DraftForm {
  provider: LlmProviderId;
  apiKey: string;
  endpoint: string;
  model: string;
}

const form = reactive<DraftForm>({
  provider: 'deepseek',
  apiKey: '',
  endpoint: '',
  model: '',
});

const selectedProviderInfo = computed(
  () => providers.value.find((p) => p.id === form.provider) ?? null,
);

const requiresKey = computed(() => selectedProviderInfo.value?.requires_api_key ?? true);

// 标记国内常用 Provider，用于在 chip 上贴"国内"标签。
const DOMESTIC_PROVIDERS: ReadonlySet<LlmProviderId> = new Set<LlmProviderId>([
  'deepseek',
  'qwen',
  'zhipu',
  'moonshot',
  'doubao',
  'minimax',
]);

function isDomestic(id: LlmProviderId): boolean {
  return DOMESTIC_PROVIDERS.has(id);
}

// 按分组组织 providers：分组后仍保持后端返回顺序（国内优先/海外次之/本地压轴），
// 并为每组附上说明文案，以区分浏览边界与特点。
interface ProviderGroup {
  key: 'cn' | 'foreign' | 'local';
  title: string;
  hint: string;
  items: LlmProviderInfo[];
}

const groupedProviders = computed<ProviderGroup[]>(() => {
  const list = providers.value;
  if (!list.length) return [];
  const cn: LlmProviderInfo[] = [];
  const foreign: LlmProviderInfo[] = [];
  const local: LlmProviderInfo[] = [];
  for (const p of list) {
    if (!p.requires_api_key && p.id === 'ollama') local.push(p);
    else if (DOMESTIC_PROVIDERS.has(p.id as LlmProviderId)) cn.push(p);
    else foreign.push(p);
  }
  const groups: ProviderGroup[] = [];
  if (cn.length) {
    groups.push({
      key: 'cn',
      title: '国内大模型',
      hint: '默认推荐 · 开箱可用 · 覆盖中文创作 / 视觉生成主流场景',
      items: cn,
    });
  }
  if (foreign.length) {
    groups.push({
      key: 'foreign',
      title: '海外大模型',
      hint: '需要跨境网络，推理在境外数据中心',
      items: foreign,
    });
  }
  if (local.length) {
    groups.push({
      key: 'local',
      title: '本地离线',
      hint: '使用本地 Ollama / llama.cpp 推理，完全离线',
      items: local,
    });
  }
  return groups;
});

watch(visible, async (open) => {
  if (!open) return;
  errorMsg.value = '';
  successMsg.value = '';
  await loadProviders();
  await loadCurrent();
});

async function loadProviders() {
  if (providers.value.length) return;
  loadingProviders.value = true;
  try {
    providers.value = await llmApi.listProviders();
  } catch (e) {
    errorMsg.value = `加载 Provider 列表失败:${String(e)}`;
  } finally {
    loadingProviders.value = false;
  }
}

async function loadCurrent() {
  // 优先用 useLlmConfig 已经缓存的 providerConfig；如果还没有则重新拉取。
  let cfg = providerConfig.value;
  if (!cfg) {
    try {
      cfg = await llmApi.getProviderConfig();
    } catch (e) {
      errorMsg.value = `读取当前配置失败:${String(e)}`;
      return;
    }
  }
  currentProvider.value = cfg.provider;
  form.provider = cfg.provider;
  form.endpoint = cfg.endpoint;
  form.model = cfg.model;
  // 出于安全考虑，后端不会主动返回明文 API Key，这里只显示"已配置"占位。
  form.apiKey = cfg.api_key ? '••••••••' : '';
}

function pickProvider(id: LlmProviderId) {
  if (form.provider === id) return;
  form.provider = id;
  const info = providers.value.find((p) => p.id === id);
  if (info) {
    form.endpoint = info.default_endpoint;
    form.model = info.default_model;
  }
  // 切换 provider 时清空旧 key，避免误存到新 provider。
  form.apiKey = '';
  errorMsg.value = '';
  successMsg.value = '';
}

function resetForm() {
  form.provider = currentProvider.value;
  const info = providers.value.find((p) => p.id === currentProvider.value);
  form.endpoint = info?.default_endpoint ?? '';
  form.model = info?.default_model ?? '';
  form.apiKey = providerConfig.value?.api_key ? '••••••••' : '';
  errorMsg.value = '';
  successMsg.value = '';
}

async function save() {
  if (saving.value) return;
  errorMsg.value = '';
  successMsg.value = '';

  // 校验
  if (!form.provider) {
    errorMsg.value = '请选择 Provider';
    return;
  }
  if (requiresKey.value) {
    // 占位符「••••••••」表示未修改，不应触发 setApiKey
    const isUnchanged = form.apiKey === '••••••••';
    if (!isUnchanged && !form.apiKey.trim()) {
      errorMsg.value = '请填写 API Key，或保持原值';
      return;
    }
  }
  if (!form.model.trim()) {
    errorMsg.value = '请填写模型名';
    return;
  }

  saving.value = true;
  try {
    if (form.provider !== currentProvider.value) {
      await llmApi.setProvider(form.provider);
      currentProvider.value = form.provider;
    }
    // 仅在 key 实际变更时调用 set_api_key（避免覆盖成空）
    const keyChanged =
      form.apiKey !== '••••••••' && form.apiKey.trim().length > 0;
    if (requiresKey.value && keyChanged) {
      await llmApi.setApiKey(form.provider, form.apiKey.trim());
    }
    await refreshLlm();
    successMsg.value = '已保存';
    // 1.2s 后自动关闭
    setTimeout(() => {
      if (visible.value) uiStore.closeSettings();
    }, 1200);
  } catch (e) {
    errorMsg.value = `保存失败:${String(e)}`;
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="settings-modal" @click.self="uiStore.closeSettings">
      <div class="settings-modal__panel">
        <header class="settings-modal__header">
          <span class="settings-modal__title">设置</span>
          <button
            class="settings-modal__close"
            type="button"
            title="关闭"
            @click="uiStore.closeSettings"
          >
            <X :size="16" />
          </button>
        </header>

        <div class="settings-modal__body">
          <section
            class="settings-modal__section"
            :class="{ 'is-llm-highlight': llmHighlight }"
            :data-llm-highlight="llmHighlight ? 'true' : 'false'"
          >
            <h3 class="settings-modal__section-title">大模型接入</h3>
            <p class="settings-modal__section-desc">
              选择一个 Provider 并填入 API Key，之后 AI 助理就可以开始工作。
            </p>

            <div class="settings-modal__field">
              <label class="settings-modal__label">Provider</label>
              <div class="settings-modal__providers" :aria-busy="loadingProviders">
                <div
                  v-for="group in groupedProviders"
                  :key="group.key"
                  class="settings-modal__provider-group"
                  :data-region="group.key"
                >
                  <div class="settings-modal__provider-group-head">
                    <span class="settings-modal__provider-group-title">{{ group.title }}</span>
                    <span class="settings-modal__provider-group-hint">{{ group.hint }}</span>
                  </div>
                  <div class="settings-modal__provider-grid">
                    <button
                      v-for="p in group.items"
                      :key="p.id"
                      type="button"
                      class="settings-modal__provider-chip"
                      :class="{
                        'is-active': form.provider === p.id,
                        'is-recommended': group.key === 'cn',
                      }"
                      :disabled="loadingProviders"
                      :data-provider-id="p.id"
                      :data-region="group.key"
                      @click="pickProvider(p.id)"
                    >
                      <span class="settings-modal__provider-name">{{ p.label }}</span>
                      <span
                        v-if="!p.requires_api_key"
                        class="settings-modal__provider-badge settings-modal__provider-badge--local"
                      >
                        本地
                      </span>
                      <span
                        v-else-if="isDomestic(p.id)"
                        class="settings-modal__provider-badge settings-modal__provider-badge--cn"
                      >
                        国内
                      </span>
                      <span class="settings-modal__provider-model">{{ p.default_model }}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div v-if="requiresKey" class="settings-modal__field">
              <label class="settings-modal__label" for="settings-api-key">API Key</label>
              <div class="settings-modal__input-group">
                <input
                  id="settings-api-key"
                  v-model="form.apiKey"
                  :type="showKey ? 'text' : 'password'"
                  class="settings-modal__input"
                  placeholder="sk-…"
                  autocomplete="off"
                  spellcheck="false"
                />
                <button
                  type="button"
                  class="settings-modal__input-action"
                  :title="showKey ? '隐藏' : '显示'"
                  @click="showKey = !showKey"
                >
                  <EyeOff v-if="showKey" :size="14" />
                  <Eye v-else :size="14" />
                </button>
              </div>
              <p class="settings-modal__hint">密钥仅保存在本地 <code>~/.openpaint/config.yaml</code>。</p>
            </div>

            <div class="settings-modal__field">
              <label class="settings-modal__label" for="settings-endpoint">Endpoint</label>
              <input
                id="settings-endpoint"
                v-model="form.endpoint"
                type="text"
                class="settings-modal__input"
                placeholder="留空则使用默认值"
                spellcheck="false"
              />
            </div>

            <div class="settings-modal__field">
              <label class="settings-modal__label" for="settings-model">默认模型</label>
              <input
                id="settings-model"
                v-model="form.model"
                type="text"
                class="settings-modal__input"
                placeholder="例如 gpt-4o / claude-3-5-sonnet / llama3.1"
                spellcheck="false"
              />
            </div>

            <p v-if="errorMsg" class="settings-modal__msg settings-modal__msg--error">
              {{ errorMsg }}
            </p>
            <p v-if="successMsg" class="settings-modal__msg settings-modal__msg--success">
              {{ successMsg }}
            </p>
          </section>
        </div>

        <footer class="settings-modal__footer">
          <button
            class="settings-modal__btn"
            type="button"
            :disabled="saving"
            @click="resetForm"
          >
            <RotateCcw :size="14" />
            重置
          </button>
          <button
            class="settings-modal__btn settings-modal__btn--primary"
            type="button"
            :disabled="saving"
            @click="save"
          >
            <Save :size="14" />
            {{ saving ? '保存中…' : '保存' }}
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.settings-modal {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.55);

  &__panel {
    display: flex;
    flex-direction: column;
    width: min(560px, 92vw);
    max-height: 88vh;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    overflow: hidden;
  }

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-3);
    border-bottom: 1px solid var(--border-color);
  }

  &__title {
    font-size: var(--font-size-md);
    font-weight: 600;
    color: var(--text-primary);
  }

  &__close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    color: var(--text-secondary);
    border-radius: var(--radius-sm);

    &:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }
  }

  &__body {
    flex: 1;
    overflow: auto;
    padding: var(--space-4) var(--space-3);
  }

  &__section {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  &__section-title {
    margin: 0;
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--text-primary);
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }

  &__section-desc {
    margin: 0;
    font-size: var(--font-size-xs);
    color: var(--text-muted);
    line-height: 1.5;
  }

  &__field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  &__label {
    font-size: var(--font-size-xs);
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  &__providers {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  &__provider-group {
    display: flex;
    flex-direction: column;
    gap: 8px;

    &[data-region='cn'] {
      // 国内大模型取默认配色加上一道细圈提升优先感，但不靠饱和色压眼。
      padding: 10px;
      border: 1px dashed rgba(214, 51, 108, 0.35);
      border-radius: var(--radius);
      background: rgba(214, 51, 108, 0.04);
    }
  }

  &__provider-group-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
  }

  &__provider-group-title {
    font-size: var(--font-size-xs);
    font-weight: 700;
    color: var(--text-primary);
    letter-spacing: 0.4px;

    [data-region='cn'] & {
      color: #d6336c;
    }

    [data-region='foreign'] &,
    [data-region='local'] & {
      color: var(--text-secondary);
    }
  }

  &__provider-group-hint {
    font-size: 11px;
    color: var(--text-muted);
    line-height: 1.3;
  }

  &__provider-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 8px;
  }

  &__provider-chip {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    padding: 10px 12px;
    font-size: var(--font-size-sm);
    text-align: left;
    color: var(--text-secondary);
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius);
    transition:
      background var(--transition-fast),
      color var(--transition-fast),
      border-color var(--transition-fast),
      box-shadow var(--transition-fast);

    &:hover:not(:disabled) {
      color: var(--text-primary);
      border-color: var(--accent);
    }

    &.is-recommended:not(.is-active) {
      // 国内默认推荐的 chip 用一道极淡的色边提醒，但不抢点击事件位置。
      background: rgba(255, 255, 255, 0.02);
      box-shadow: inset 0 0 0 1px rgba(214, 51, 108, 0.15);
    }

    &.is-active {
      color: #fff;
      background: var(--accent);
      border-color: var(--accent);
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  &__provider-name {
    font-weight: 600;
    line-height: 1.3;
  }

  &__provider-model {
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    color: var(--text-muted);
    line-height: 1.3;
  }

  &__provider-chip.is-active &__provider-model {
    color: rgba(255, 255, 255, 0.85);
  }

  &__provider-badge {
    position: absolute;
    top: 6px;
    right: 8px;
    padding: 1px 6px;
    font-size: 10px;
    line-height: 1.4;
    border-radius: 999px;

    &--local {
      color: var(--accent);
      background: rgba(108, 92, 231, 0.12);
    }

    &--cn {
      color: #d6336c;
      background: rgba(214, 51, 108, 0.1);
    }
  }

  &__provider-chip.is-active &__provider-badge {
    color: #fff;
    background: rgba(255, 255, 255, 0.22);
  }

  &__input-group {
    position: relative;
    display: flex;
    align-items: center;
  }

  &__input {
    width: 100%;
    padding: 8px 12px;
    padding-right: 36px;
    font-family: var(--font-family-mono);
    font-size: var(--font-size-sm);
    color: var(--text-primary);
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    outline: none;
    transition: border-color var(--transition-fast);

    &:focus {
      border-color: var(--accent);
    }

    &::placeholder {
      color: var(--text-muted);
    }
  }

  &__input-action {
    position: absolute;
    right: 6px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    color: var(--text-muted);
    border-radius: var(--radius-sm);

    &:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }
  }

  &__hint {
    margin: 0;
    font-size: var(--font-size-xs);
    color: var(--text-muted);
    line-height: 1.4;

    code {
      padding: 1px 4px;
      font-family: var(--font-family-mono);
      background: var(--bg-tertiary);
      border-radius: 3px;
    }
  }

  &__msg {
    margin: 0;
    padding: 8px 12px;
    font-size: var(--font-size-xs);
    border-radius: var(--radius-sm);

    &--error {
      color: var(--error);
      background: rgba(214, 48, 49, 0.1);
    }

    &--success {
      color: var(--success, #00b894);
      background: rgba(0, 184, 148, 0.1);
    }
  }

  &__footer {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    padding: var(--space-3);
    border-top: 1px solid var(--border-color);
  }

  &__btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    border-radius: var(--radius-sm);

    &:hover:not(:disabled) {
      background: var(--bg-hover);
      color: var(--text-primary);
    }

    &:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    &--primary {
      color: #fff;
      background: var(--accent);

      &:hover:not(:disabled) {
        background: var(--accent-hover);
        color: #fff;
      }
    }
  }

  // UX-A07：从 AI 助理未配置点 CTA 进来时的 LLM 区高亮脉冲
  &__section.is-llm-highlight {
    position: relative;
    border-radius: var(--radius);
    animation: settings-llm-pulse 1.4s ease-in-out 0s 3;
  }

  &__section.is-llm-highlight::after {
    content: '';
    position: absolute;
    inset: -4px;
    pointer-events: none;
    border: 2px solid var(--accent);
    border-radius: calc(var(--radius) + 4px);
    animation: settings-llm-ring 1.4s ease-in-out 0s 3;
  }
}

@keyframes settings-llm-pulse {
  0%,
  100% {
    background: transparent;
  }
  50% {
    background: var(--accent-light, rgba(108, 92, 231, 0.08));
  }
}

@keyframes settings-llm-ring {
  0% {
    opacity: 0;
    transform: scale(0.98);
  }
  50% {
    opacity: 1;
    transform: scale(1);
  }
  100% {
    opacity: 0;
    transform: scale(1.02);
  }
}
</style>
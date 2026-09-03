<!--
  IconPanel.vue — Iconify 图标搜索面板（W9）

  嵌入在 LeftSidebar 的"资源"Tab 下，承载：
  - 搜索框（含 500ms 防抖，useAssets 内部）
  - style 过滤（lucide / heroicons / ...）
  - 结果按 prefix 分组网格展示
  - 单击 → 打开 IconPreview
  - 双击 → 直接落到画布

  Acceptance: US-AST-1 手动插入图标（spec §1）
-->

<script setup lang="ts">
import { computed, toRef } from 'vue';
import { useAssets, useGroupedIcons } from '@/composables/useAssets';
import IconPreview from './IconPreview.vue';
import type { IconMeta, IconPrefix } from '@/types/asset';

const emit = defineEmits<{
  (e: 'icon-imported', payload: { icon: IconMeta; layerId: string }): void;
  (e: 'error', message: string): void;
}>();

const assets = useAssets();
const grouped = useGroupedIcons(toRef(assets, 'searchResults'));

const styleOptions: { value: IconPrefix | ''; label: string }[] = [
  { value: '', label: '全部' },
  { value: 'lucide', label: 'Lucide' },
  { value: 'heroicons', label: 'Heroicons' },
  { value: 'tabler', label: 'Tabler' },
  { value: 'material-symbols', label: 'Material' },
  { value: 'phosphor', label: 'Phosphor' },
  { value: 'iconoir', label: 'Iconoir' },
];

function onStyleChange(event: Event): void {
  const target = event.target as HTMLSelectElement;
  assets.searchStyle.value = target.value || null;
}

function onPreview(icon: IconMeta): void {
  void assets.openPreview(icon);
}

async function onDoubleClick(icon: IconMeta): Promise<void> {
  try {
    const layerId = await assets.importIconToCanvas(icon);
    emit('icon-imported', { icon, layerId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    emit('error', `插入图标失败：${msg}`);
  }
}

function onPreviewInsert(icon: IconMeta): void {
  void onDoubleClick(icon);
}

const totalLabel = computed(() => {
  const t = assets.searchTotal.value;
  return t > 0 ? `共 ${t} 个` : '';
});
</script>

<template>
  <div class="icon-panel" role="region" :aria-label="'图标资源面板'">
    <div class="icon-panel__header">
      <input
        v-model="assets.searchQuery.value"
        type="search"
        class="icon-panel__search"
        placeholder="搜索图标 (Lucide / Material…)"
        :aria-label="'搜索图标'"
      />
      <select
        class="icon-panel__style-select"
        :value="assets.searchStyle.value ?? ''"
        :aria-label="'按图标集过滤'"
        @change="onStyleChange"
      >
        <option v-for="opt in styleOptions" :key="opt.value" :value="opt.value">
          {{ opt.label }}
        </option>
      </select>
    </div>

    <div v-if="assets.isSearching.value" class="icon-panel__status" role="status">搜索中…</div>

    <div
      v-else-if="assets.searchError.value"
      class="icon-panel__status icon-panel__status--error"
      role="alert"
    >
      {{ assets.searchError.value }}
    </div>

    <div v-else-if="assets.searchResults.value.length === 0" class="icon-panel__empty">
      <p>没有匹配的图标</p>
      <p class="icon-panel__hint">试试英文 / 中文 / 拼音</p>
    </div>

    <div v-else class="icon-panel__results">
      <section v-for="group in grouped" :key="group.prefix" class="icon-panel__group">
        <h3 class="icon-panel__group-title">{{ group.prefix }} · {{ group.items.length }}</h3>
        <div class="icon-panel__grid">
          <button
            v-for="icon in group.items"
            :key="`${icon.prefix}/${icon.name}`"
            type="button"
            class="icon-panel__item"
            :title="`${icon.prefix}/${icon.name} — ${icon.tags.join(', ')}`"
            :aria-label="`图标 ${icon.prefix}/${icon.name}，${icon.category}分类`"
            @click="onPreview(icon)"
            @dblclick="onDoubleClick(icon)"
          >
            <span class="icon-panel__item-name">{{ icon.name }}</span>
          </button>
        </div>
      </section>

      <p v-if="totalLabel" class="icon-panel__total">{{ totalLabel }}</p>
    </div>

    <IconPreview
      v-if="assets.previewedIcon.value"
      :icon="assets.previewedIcon.value"
      :svg="assets.previewSvg.value"
      :loading="assets.isRendering.value"
      :error="assets.renderError.value"
      @close="assets.closePreview"
      @insert="onPreviewInsert"
    />
  </div>
</template>

<style scoped lang="scss">
.icon-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-2);
  width: 100%;
  height: 100%;
  overflow-y: auto;

  &__header {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  &__search {
    width: 100%;
    padding: 6px 8px;
    background: var(--bg-secondary);
    color: var(--text-primary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    font-size: 13px;

    &:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 1px;
      border-color: var(--accent);
    }
  }

  &__style-select {
    width: 100%;
    padding: 4px 8px;
    background: var(--bg-secondary);
    color: var(--text-primary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    font-size: 12px;
  }

  &__status {
    padding: var(--space-2);
    color: var(--text-secondary);
    font-size: 12px;
    text-align: center;

    &--error {
      color: var(--error);
    }
  }

  &__empty {
    padding: var(--space-4) var(--space-2);
    color: var(--text-muted);
    font-size: 12px;
    text-align: center;
  }

  &__hint {
    margin-top: var(--space-1);
    font-size: 11px;
    color: var(--text-muted);
  }

  &__results {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  &__group {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  &__group-title {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
    margin: 0;
  }

  &__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
    gap: var(--space-1);
  }

  &__item {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    height: 56px;
    padding: 4px;
    background: var(--bg-secondary);
    color: var(--text-primary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition:
      background var(--transition-fast),
      border-color var(--transition-fast);

    &:hover {
      background: var(--bg-hover);
      border-color: var(--accent);
    }

    &:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 1px;
    }
  }

  &__item-name {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 10px;
    color: var(--text-secondary);
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  &__total {
    font-size: 11px;
    color: var(--text-muted);
    text-align: center;
    margin-top: var(--space-2);
  }
}
</style>

<!--
  BrushPanel.vue — 8 个内置画刷网格（W10）

  嵌入在 ResourceTabs 的 "画刷" 二级 Tab 下，承载：
  - 8 个画刷缩略图（来自 assetApi.listBrushAssets）
  - 单击切换活动画刷（写 canvasStore.activeBrushId）
  - 高亮当前选中画刷
  - 顶部"AI 生成"入口占位（v0.3）

  Acceptance: US-AST-3 选择笔刷（W10 spec §1）
-->

<script setup lang="ts">
import { onMounted } from 'vue';
import { Sparkles } from 'lucide-vue-next';
import { useAssets } from '@/composables/useAssets';
import { useCanvasStore } from '@stores/canvasStore';
import type { BrushAsset } from '@/types/asset';

const emit = defineEmits<{
  (e: 'brush-changed', brushId: string): void;
  (e: 'error', message: string): void;
}>();

const assets = useAssets();
const store = useCanvasStore();

onMounted(async () => {
  try {
    await assets.loadBrushes();
  } catch (err) {
    emit('error', err instanceof Error ? err.message : String(err));
  }
});

function brushImageSrc(brush: BrushAsset): string {
  return `data:image/png;base64,${brush.pngBase64}`;
}

function onSelect(brush: BrushAsset): void {
  store.setActiveBrush(brush.id);
  assets.setActiveBrush(brush.id);
  emit('brush-changed', brush.id);
}

function onAiGenerateClick(): void {
  emit(
    'error',
    'AI 画刷生成将在 v0.3 落地（当前由 create_brush_from_prompt MCP stub 占位）。',
  );
}
</script>

<template>
  <div class="brush-panel" role="region" :aria-label="'画刷资源面板'">
    <header class="brush-panel__header">
      <h3 class="brush-panel__title">画刷</h3>
      <button
        type="button"
        class="brush-panel__ai"
        title="AI 生成画刷（v0.3）"
        aria-label="AI 生成画刷"
        @click="onAiGenerateClick"
      >
        <component :is="Sparkles" :size="14" />
        <span>AI 生成</span>
      </button>
    </header>

    <div v-if="assets.brushLoading.value" class="brush-panel__status" role="status">
      加载画刷中…
    </div>

    <div v-else-if="assets.brushError.value" class="brush-panel__status brush-panel__status--error" role="alert">
      {{ assets.brushError.value }}
    </div>

    <div v-else-if="assets.brushAssets.value.length === 0" class="brush-panel__empty">
      <p>未找到画刷资源</p>
    </div>

    <div v-else class="brush-panel__grid">
      <button
        v-for="brush in assets.brushAssets.value"
        :key="brush.id"
        type="button"
        class="brush-panel__item"
        :class="{ 'is-active': store.activeBrushId === brush.id }"
        :title="`${brush.nameZh}（${brush.nameEn}）— ${brush.description}`"
        :aria-label="`画刷 ${brush.nameZh}，${brush.category}分类，半径 ${brush.defaultRadius}`"
        :aria-pressed="store.activeBrushId === brush.id"
        @click="onSelect(brush)"
      >
        <img
          :src="brushImageSrc(brush)"
          :alt="brush.nameZh"
          class="brush-panel__thumb"
          draggable="false"
        />
        <span class="brush-panel__name">{{ brush.nameZh }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.brush-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-2);
  width: 100%;
  height: 100%;
  overflow-y: auto;

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }

  &__title {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
  }

  &__ai {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    background: var(--bg-secondary);
    color: var(--text-secondary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    font-size: 11px;
    cursor: pointer;
    transition:
      background var(--transition-fast),
      border-color var(--transition-fast),
      color var(--transition-fast);

    &:hover {
      background: var(--accent-light);
      border-color: var(--accent);
      color: var(--accent);
    }
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

  &__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
    gap: var(--space-2);
  }

  &__item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 6px;
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

    &.is-active {
      background: var(--accent-light);
      border-color: var(--accent);

      .brush-panel__name {
        color: var(--accent);
      }
    }
  }

  &__thumb {
    width: 48px;
    height: 48px;
    object-fit: contain;
    image-rendering: pixelated;
  }

  &__name {
    font-size: 10px;
    color: var(--text-secondary);
    text-align: center;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
</style>
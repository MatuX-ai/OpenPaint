<!--
  PalettePanel.vue — 4 套调色板 + 16 渐变预设（W10）

  嵌入在 ResourceTabs 的 "调色板" 二级 Tab 下，承载：
  - 顶部 chip 切换 "调色板 / 渐变"
  - 调色板视图：4 个调色板横排，点击展开色块网格
  - 渐变视图：16 个渐变缩略图，点击 apply 到当前图层

  Acceptance: US-AST-4 应用调色板（W10 spec §1）
-->

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useAssets } from '@/composables/useAssets';
import type { GradientPreset, Palette } from '@/types/asset';

const emit = defineEmits<{
  (e: 'palette-applied', payload: { paletteId: string; mode: 'swatch_bar' | 'replace_color' }): void;
  (e: 'gradient-applied', payload: { gradientId: string }): void;
  (e: 'error', message: string): void;
}>();

type ViewMode = 'palette' | 'gradient';

const assets = useAssets();
const viewMode = ref<ViewMode>('palette');

const palettesView = computed<Palette[]>(() => assets.palettes.value);
const gradientsView = computed<GradientPreset[]>(() => assets.gradients.value);

const gradientPreview = computed<Map<string, string>>(() => {
  const map = new Map<string, string>();
  for (const g of gradientsView.value) {
    map.set(g.id, buildGradientCss(g));
  }
  return map;
});

function buildGradientCss(g: GradientPreset): string {
  const stops = g.stops
    .map((s) => `${s.hex} ${Math.round(s.offset * 100)}%`)
    .join(', ');
  if (g.type === 'radial') {
    const [cx, cy] = g.center ?? [0.5, 0.5];
    return `radial-gradient(circle at ${cx * 100}% ${cy * 100}%, ${stops})`;
  }
  if (g.type === 'conic') {
    const [cx, cy] = g.center ?? [0.5, 0.5];
    return `conic-gradient(from 0deg at ${cx * 100}% ${cy * 100}%, ${stops})`;
  }
  const angle = g.angle ?? 180;
  return `linear-gradient(${angle}deg, ${stops})`;
}

onMounted(async () => {
  try {
    await Promise.all([assets.loadPalettes(), assets.loadGradients()]);
  } catch (err) {
    emit('error', err instanceof Error ? err.message : String(err));
  }
});

async function onApplySwatchBar(palette: Palette): Promise<void> {
  try {
    await assets.applyPalette(palette.id, 'swatch_bar');
    emit('palette-applied', { paletteId: palette.id, mode: 'swatch_bar' });
  } catch (err) {
    emit('error', `应用色条失败：${err instanceof Error ? err.message : String(err)}`);
  }
}

async function onApplyReplaceColor(palette: Palette, hex: string): Promise<void> {
  try {
    await assets.applyPalette(palette.id, 'replace_color', { replaceHex: hex });
    emit('palette-applied', { paletteId: palette.id, mode: 'replace_color' });
  } catch (err) {
    emit('error', `替换颜色失败：${err instanceof Error ? err.message : String(err)}`);
  }
}

async function onApplyGradient(g: GradientPreset): Promise<void> {
  try {
    await assets.applyGradient(g.id, { opacity: 1.0 });
    emit('gradient-applied', { gradientId: g.id });
  } catch (err) {
    emit('error', `应用渐变失败：${err instanceof Error ? err.message : String(err)}`);
  }
}

function onPickColor(palette: Palette, hex: string): void {
  void onApplyReplaceColor(palette, hex);
}
</script>

<template>
  <div class="palette-panel" role="region" :aria-label="'调色板资源面板'">
    <header class="palette-panel__header">
      <div class="palette-panel__chips" role="tablist">
        <button
          type="button"
          role="tab"
          class="palette-panel__chip"
          :class="{ 'is-active': viewMode === 'palette' }"
          :aria-selected="viewMode === 'palette'"
          @click="viewMode = 'palette'"
        >
          调色板
        </button>
        <button
          type="button"
          role="tab"
          class="palette-panel__chip"
          :class="{ 'is-active': viewMode === 'gradient' }"
          :aria-selected="viewMode === 'gradient'"
          @click="viewMode = 'gradient'"
        >
          渐变
        </button>
      </div>
    </header>

    <!-- 调色板视图 -->
    <div v-if="viewMode === 'palette'" class="palette-panel__palettes">
      <div v-if="assets.palettesLoading.value" class="palette-panel__status">加载调色板中…</div>
      <div v-else-if="assets.palettesError.value" class="palette-panel__status palette-panel__status--error">
        {{ assets.palettesError.value }}
      </div>
      <section
        v-for="palette in palettesView"
        :key="palette.id"
        class="palette-panel__palette"
      >
        <header class="palette-panel__palette-header">
          <h4 class="palette-panel__palette-name">{{ palette.nameZh }}</h4>
          <button
            type="button"
            class="palette-panel__apply"
            :title="`将 ${palette.nameZh} 追加到底部色条`"
            :aria-label="`应用 ${palette.nameZh} 到底部色条`"
            @click="onApplySwatchBar(palette)"
          >
            应用色条
          </button>
        </header>
        <div class="palette-panel__swatches">
          <button
            v-for="color in palette.colors"
            :key="color.hex"
            type="button"
            class="palette-panel__swatch"
            :style="{ background: color.hex }"
            :title="`${color.nameZh}（${color.nameEn}）— ${color.hex}`"
            :aria-label="`颜色 ${color.nameZh}，十六进制 ${color.hex}，单击替换主色`"
            @click="onPickColor(palette, color.hex)"
          />
        </div>
      </section>
    </div>

    <!-- 渐变视图 -->
    <div v-else class="palette-panel__gradients">
      <div v-if="assets.gradientsLoading.value" class="palette-panel__status">加载渐变中…</div>
      <div v-else-if="assets.gradientsError.value" class="palette-panel__status palette-panel__status--error">
        {{ assets.gradientsError.value }}
      </div>
      <div v-else class="palette-panel__gradient-grid">
        <button
          v-for="g in gradientsView"
          :key="g.id"
          type="button"
          class="palette-panel__gradient"
          :title="`${g.nameZh}（${g.nameEn}）— ${g.type}，${g.stops.length} 段`"
          :aria-label="`渐变 ${g.nameZh}，${g.type} 类型，${g.stops.length} 段颜色，单击应用到当前图层`"
          :style="{ backgroundImage: gradientPreview.get(g.id) }"
          @click="onApplyGradient(g)"
        >
          <span class="palette-panel__gradient-label">{{ g.nameZh }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.palette-panel {
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
    justify-content: flex-start;
  }

  &__chips {
    display: inline-flex;
    background: var(--bg-tertiary, transparent);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    padding: 2px;
  }

  &__chip {
    padding: 4px 10px;
    background: transparent;
    color: var(--text-secondary);
    border: 0;
    border-radius: var(--radius-sm);
    font-size: 12px;
    cursor: pointer;

    &.is-active {
      background: var(--accent);
      color: var(--accent-contrast, #fff);
    }

    &:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 1px;
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

  &__palettes {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  &__palette {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  &__palette-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }

  &__palette-name {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-primary);
  }

  &__apply {
    padding: 2px 8px;
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

  &__swatches {
    display: grid;
    grid-template-columns: repeat(10, 1fr);
    gap: 2px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }

  &__swatch {
    aspect-ratio: 1;
    border: 0;
    padding: 0;
    cursor: pointer;
    transition:
      transform var(--transition-fast),
      outline-offset var(--transition-fast);

    &:hover {
      transform: scale(1.1);
      z-index: 1;
    }

    &:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 1px;
    }
  }

  &__gradients {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  &__gradient-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-2);
  }

  &__gradient {
    position: relative;
    aspect-ratio: 16 / 9;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    overflow: hidden;
    cursor: pointer;
    transition:
      border-color var(--transition-fast),
      transform var(--transition-fast);

    &:hover {
      border-color: var(--accent);
      transform: translateY(-1px);
    }

    &:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 1px;
    }
  }

  &__gradient-label {
    position: absolute;
    bottom: 4px;
    left: 4px;
    padding: 2px 6px;
    background: rgba(0, 0, 0, 0.55);
    color: #fff;
    font-size: 10px;
    border-radius: 2px;
  }
}
</style>
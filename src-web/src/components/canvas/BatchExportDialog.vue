<!--
  BatchExportDialog — 多尺寸批量导出。
  - 预设：iOS / Android / Web / 自定义
  - 勾选 / 取消单个尺寸
  - "同时存入图库"复选框 + 标签输入

  关联需求：docs/ux-onboarding-requirements.md US-9。
-->

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import AppModal from '@components/common/AppModal.vue';
import AppButton from '@components/common/AppButton.vue';

type Preset = {
  id: 'ios' | 'android' | 'web' | 'favicon';
  label: string;
  description: string;
  sizes: number[];
};

const PRESETS: Preset[] = [
  { id: 'ios', label: 'iOS 图标', description: 'iPhone / iPad 全套', sizes: [20, 29, 40, 60, 76, 83.5, 1024] },
  { id: 'android', label: 'Android 图标', description: 'mipmap / xxxhdpi', sizes: [48, 72, 96, 144, 192, 512] },
  { id: 'web', label: 'Web 图标', description: 'PWA / favicon', sizes: [16, 32, 48, 180, 192, 512] },
  { id: 'favicon', label: 'Favicon', description: '经典三尺寸', sizes: [16, 32, 64] },
];

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{
  (e: 'update:open', v: boolean): void;
  (e: 'confirm', v: {
    sizes: number[];
    saveToGallery: boolean;
    tags: string[];
  }): void;
}>();

const activePreset = ref<Preset['id']>('ios');
const selected = ref<Set<number>>(
  new Set(PRESETS.find((p) => p.id === 'ios')?.sizes ?? []),
);
const saveToGallery = ref(true);
const tagsInput = ref('');
const customMode = ref(false);
const customInput = ref('256,512,1024');

const currentSizes = computed(() => {
  if (customMode.value) {
    return customInput.value
      .split(/[,，\s]+/)
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);
  }
  return PRESETS.find((p) => p.id === activePreset.value)?.sizes ?? [];
});

watch(
  () => props.open,
  (open) => {
    if (open) {
      saveToGallery.value = true;
      tagsInput.value = '';
      customMode.value = false;
      togglePreset('ios');
    }
  },
);

function togglePreset(id: Preset['id']): void {
  activePreset.value = id;
  customMode.value = false;
  const sizes = PRESETS.find((p) => p.id === id)?.sizes ?? [];
  selected.value = new Set(sizes);
}

function toggleSize(s: number): void {
  if (selected.value.has(s)) selected.value.delete(s);
  else selected.value.add(s);
  // 触发响应式更新
  selected.value = new Set(selected.value);
}

const finalSizes = computed(() => Array.from(selected.value).sort((a, b) => a - b));
const finalTags = computed(() =>
  tagsInput.value
    .split(/[,，\s]+/)
    .map((s) => s.trim())
    .filter(Boolean),
);

function onConfirm(): void {
  if (finalSizes.value.length === 0) return;
  emit('confirm', {
    sizes: finalSizes.value,
    saveToGallery: saveToGallery.value,
    tags: finalTags.value,
  });
}
</script>

<template>
  <AppModal :open="open" title="批量导出" :width="560" @update:open="emit('update:open', $event)">
    <div class="batch-export">
      <section>
        <h3 class="batch-export__label">预设平台</h3>
        <div class="batch-export__presets">
          <button
            v-for="p in PRESETS"
            :key="p.id"
            type="button"
            class="batch-export__preset"
            :class="{ 'is-active': !customMode && activePreset === p.id }"
            @click="togglePreset(p.id)"
          >
            <div class="batch-export__preset-label">{{ p.label }}</div>
            <div class="batch-export__preset-desc">{{ p.description }}</div>
          </button>
        </div>
      </section>

      <section>
        <button
          type="button"
          class="batch-export__custom"
          :class="{ 'is-active': customMode }"
          @click="
            customMode = !customMode;
            if (customMode) selected = new Set(currentSizes);
          "
        >
          自定义尺寸（逗号分隔，如 256,512,1024）
        </button>
      </section>

      <section>
        <h3 class="batch-export__label">尺寸勾选（{{ finalSizes.length }} / {{ currentSizes.length }}）</h3>
        <div class="batch-export__sizes">
          <label
            v-for="s in currentSizes"
            :key="s"
            class="batch-export__size"
            :class="{ 'is-active': selected.has(s) }"
          >
            <input
              type="checkbox"
              :checked="selected.has(s)"
              @change="toggleSize(s)"
            />
            <span>{{ s }} × {{ s }} px</span>
          </label>
        </div>
      </section>

      <section>
        <label class="batch-export__check">
          <input v-model="saveToGallery" type="checkbox" />
          <span>同时存入图库（每张自动打标签）</span>
        </label>
        <label v-if="saveToGallery" class="batch-export__tags">
          <span class="batch-export__label">标签</span>
          <input
            v-model="tagsInput"
            type="text"
            placeholder="ios, v2.0, 正式版"
            class="batch-export__tags-input"
          />
        </label>
      </section>
    </div>

    <template #footer>
      <AppButton variant="ghost" @click="emit('update:open', false)">取消</AppButton>
      <AppButton
        variant="primary"
        :disabled="finalSizes.length === 0"
        @click="onConfirm"
      >
        导出 {{ finalSizes.length }} 张
      </AppButton>
    </template>
  </AppModal>
</template>

<style scoped lang="scss">
.batch-export {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);

  &__label {
    margin: 0 0 var(--space-2);
    font-size: var(--font-size-xs);
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  &__presets {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-2);
  }

  &__preset {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-1);
    padding: var(--space-3);
    text-align: left;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius);

    &:hover {
      border-color: var(--text-muted);
    }

    &.is-active {
      border-color: var(--accent);
      background: var(--accent-light);
    }
  }

  &__preset-label {
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--text-primary);
  }

  &__preset-desc {
    font-size: var(--font-size-xs);
    color: var(--text-muted);
  }

  &__custom {
    font-size: var(--font-size-sm);
    color: var(--accent);

    &.is-active {
      color: var(--text-primary);
    }
  }

  &__sizes {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-2);
  }

  &__size {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2);
    font-size: var(--font-size-xs);
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    cursor: pointer;

    &.is-active {
      border-color: var(--accent);
      background: var(--accent-light);
    }

    span {
      font-family: var(--font-family-mono);
    }
  }

  &__check {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--font-size-sm);
    color: var(--text-primary);
    cursor: pointer;
  }

  &__tags {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin-top: var(--space-2);
  }

  &__tags-input {
    height: 30px;
    padding: 0 var(--space-2);
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
  }
}
</style>

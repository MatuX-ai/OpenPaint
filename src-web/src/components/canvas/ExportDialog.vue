<!--
  ExportDialog — 单张导出（PNG / JPG / WebP）。
  - 格式选择
  - JPG / WebP 显示质量滑块（默认 90）
  - 写入本地路径

  关联需求：docs/ux-onboarding-requirements.md US-5 / US-9（单张）。
-->

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import AppModal from '@components/common/AppModal.vue';
import AppButton from '@components/common/AppButton.vue';

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:open', v: boolean): void;
  (e: 'confirm', v: { format: 'png' | 'jpg' | 'webp'; quality: number }): void;
}>();

const format = ref<'png' | 'jpg' | 'webp'>('png');
const quality = ref(90);

const showQuality = computed(() => format.value !== 'png');

watch(
  () => props.open,
  (open) => {
    if (open) {
      format.value = 'png';
      quality.value = 90;
    }
  },
);

function onConfirm(): void {
  emit('confirm', { format: format.value, quality: quality.value });
}
</script>

<template>
  <AppModal :open="open" title="导出图片" :width="440" @update:open="emit('update:open', $event)">
    <div class="export-dialog">
      <div class="export-dialog__row">
        <label class="export-dialog__label">格式</label>
        <div class="export-dialog__formats">
          <button
            v-for="f in ['png', 'jpg', 'webp'] as const"
            :key="f"
            type="button"
            class="export-dialog__format"
            :class="{ 'is-active': format === f }"
            @click="format = f"
          >
            {{ f.toUpperCase() }}
          </button>
        </div>
      </div>

      <div v-if="showQuality" class="export-dialog__row">
        <label class="export-dialog__label" for="export-quality">质量 {{ quality }}</label>
        <input
          id="export-quality"
          v-model.number="quality"
          type="range"
          min="10"
          max="100"
          step="1"
        />
      </div>

      <p class="export-dialog__hint">
        {{ format === 'png' ? 'PNG 为无损格式，适合需要透明背景的素材。' : '' }}
        {{ format === 'jpg' ? 'JPG 适合照片类内容，体积较小。' : '' }}
        {{ format === 'webp' ? 'WebP 兼顾体积与质量，适合 Web 场景。' : '' }}
      </p>
    </div>

    <template #footer>
      <AppButton variant="ghost" @click="emit('update:open', false)">取消</AppButton>
      <AppButton variant="primary" @click="onConfirm">选择路径并导出</AppButton>
    </template>
  </AppModal>
</template>

<style scoped lang="scss">
.export-dialog {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);

  &__row {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  &__label {
    font-size: var(--font-size-xs);
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  &__formats {
    display: flex;
    gap: var(--space-2);
  }

  &__format {
    flex: 1;
    height: 36px;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    color: var(--text-primary);
    font-weight: 600;

    &:hover {
      border-color: var(--text-muted);
    }

    &.is-active {
      border-color: var(--accent);
      background: var(--accent-light);
      color: var(--accent);
    }
  }

  &__hint {
    margin: 0;
    font-size: var(--font-size-xs);
    color: var(--text-muted);
    line-height: 1.5;
  }

  input[type='range'] {
    accent-color: var(--accent);
  }
}
</style>

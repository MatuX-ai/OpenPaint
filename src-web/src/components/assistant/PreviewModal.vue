<!--
  AI result preview modal — show generated image, confirm / cancel / refine.
-->

<script setup lang="ts">
import { computed, ref } from 'vue';
import { X, Check, Pencil } from 'lucide-vue-next';
import { useUIStore } from '@stores/uiStore';
import { canvasApi } from '@api/index';
import Spinner from '@/components/common/Spinner.vue';

const uiStore = useUIStore();

const visible = computed(() => uiStore.previewModalVisible);
const payload = computed(() => uiStore.previewPayload);

const imgSrc = computed(() => {
  const png = payload.value?.png;
  if (!png) return '';
  return png.startsWith('data:image/') ? png : `data:image/png;base64,${png}`;
});

const busy = ref(false);

async function confirm() {
  if (!payload.value?.png || busy.value) return;
  busy.value = true;
  try {
    await canvasApi.pasteImage(payload.value.png);
    uiStore.closePreview();
  } catch (e) {
    console.error('[PreviewModal] confirm failed:', e);
  } finally {
    busy.value = false;
  }
}

function refine() {
  // W4: expand the OpenPencil right panel for manual editing.
  uiStore.switchRightPanel('openpencil');
  uiStore.closePreview();
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="preview-modal" @click.self="uiStore.closePreview">
      <div class="preview-modal__panel">
        <header class="preview-modal__header">
          <span class="preview-modal__title">AI 生成预览</span>
          <button class="preview-modal__close" type="button" title="关闭" @click="uiStore.closePreview">
            <X :size="16" />
          </button>
        </header>

        <div class="preview-modal__body">
          <div v-if="payload?.title" class="preview-modal__prompt">{{ payload.title }}</div>
          <div class="preview-modal__image">
            <img v-if="imgSrc" :src="imgSrc" alt="AI 生成结果" />
            <div v-else class="preview-modal__loading">
              <Spinner size="lg" />
              <span>生成中…</span>
            </div>
          </div>
        </div>

        <footer class="preview-modal__footer">
          <button class="preview-modal__btn" type="button" @click="uiStore.closePreview">取消</button>
          <button class="preview-modal__btn" type="button" @click="refine">
            <Pencil :size="14" />
            微调
          </button>
          <button
            class="preview-modal__btn preview-modal__btn--primary"
            type="button"
            :disabled="busy || !imgSrc"
            @click="confirm"
          >
            <Check :size="14" />
            确认落回画布
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.preview-modal {
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
    width: min(560px, 90vw);
    max-height: 85vh;
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
    padding: var(--space-3);
  }

  &__prompt {
    margin-bottom: var(--space-2);
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
  }

  &__image {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 240px;
    background: var(--bg-tertiary);
    border-radius: var(--radius);

    img {
      max-width: 100%;
      max-height: 380px;
      object-fit: contain;
    }
  }

  &__loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    color: var(--text-muted);
    font-size: var(--font-size-sm);
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
}
</style>
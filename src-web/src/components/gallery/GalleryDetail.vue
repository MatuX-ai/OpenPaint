<!--
  Gallery detail overlay — full-size preview + metadata.
-->

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { X, Copy } from 'lucide-vue-next';
import type { GalleryItem } from '@/types/gallery';
import { formatRelative } from '@utils/format';

const props = defineProps<{ item: GalleryItem | null; png?: string }>();
const emit = defineEmits<{ close: []; 'paste-to-canvas': [item: GalleryItem] }>();

const visible = computed(() => !!props.item);
const imgSrc = computed(() => props.png || (props.item?.thumbnailPath.startsWith('data:') ? props.item.thumbnailPath : ''));

const copied = ref(false);
async function copyPrompt() {
  if (!props.item?.prompt) return;
  try {
    await navigator.clipboard.writeText(props.item.prompt);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1200);
  } catch {
    // clipboard unavailable
  }
}

watch(visible, (v) => {
  if (!v) copied.value = false;
});
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="gallery-detail" @click.self="emit('close')">
      <div class="gallery-detail__panel">
        <header class="gallery-detail__header">
          <span class="gallery-detail__title">图库详情</span>
          <button class="gallery-detail__close" type="button" title="关闭" @click="emit('close')">
            <X :size="16" />
          </button>
        </header>

        <div class="gallery-detail__body">
          <div class="gallery-detail__preview">
            <img v-if="imgSrc" :src="imgSrc" :alt="item?.prompt || 'preview'" />
            <div v-else class="gallery-detail__placeholder">预览不可用</div>
          </div>

          <dl class="gallery-detail__meta">
            <div class="gallery-detail__row">
              <dt>尺寸</dt>
              <dd>{{ item?.width }} × {{ item?.height }}</dd>
            </div>
            <div class="gallery-detail__row">
              <dt>来源</dt>
              <dd>{{ item?.source === 'ai_generated' ? 'AI 生成' : '导入' }}</dd>
            </div>
            <div class="gallery-detail__row">
              <dt>创建</dt>
              <dd>{{ item ? formatRelative(item.createdAt) : '—' }}</dd>
            </div>
            <div v-if="item?.model" class="gallery-detail__row">
              <dt>模型</dt>
              <dd>{{ item.model }}</dd>
            </div>
            <div v-if="item?.prompt" class="gallery-detail__row gallery-detail__row--prompt">
              <dt>提示词</dt>
              <dd>
                {{ item.prompt }}
                <button class="gallery-detail__copy" type="button" title="复制" @click="copyPrompt">
                  <Copy :size="12" />
                  {{ copied ? '已复制' : '' }}
                </button>
              </dd>
            </div>
            <div v-if="item?.tags?.length" class="gallery-detail__row">
              <dt>标签</dt>
              <dd class="gallery-detail__tags">
                <span v-for="tag in item.tags" :key="tag" class="gallery-detail__tag">{{ tag }}</span>
              </dd>
            </div>
          </dl>
        </div>

        <footer class="gallery-detail__footer">
          <button
            class="gallery-detail__paste"
            type="button"
            :disabled="!item"
            @click="item && emit('paste-to-canvas', item)"
          >
            置入画布
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.gallery-detail {
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
    width: min(640px, 90vw);
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
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  &__preview {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 240px;
    background: var(--bg-tertiary);
    border-radius: var(--radius);

    img {
      max-width: 100%;
      max-height: 360px;
      object-fit: contain;
    }
  }

  &__placeholder {
    color: var(--text-muted);
    font-size: var(--font-size-sm);
  }

  &__meta {
    margin: 0;
    display: grid;
    gap: var(--space-2);
    font-size: var(--font-size-sm);
  }

  &__row {
    display: grid;
    grid-template-columns: 72px 1fr;
    gap: var(--space-2);

    dt {
      color: var(--text-muted);
    }
    dd {
      margin: 0;
      color: var(--text-primary);
      word-break: break-word;
    }

    &--prompt dd {
      display: flex;
      align-items: flex-start;
      gap: var(--space-2);
    }
  }

  &__copy {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--accent);
    font-size: var(--font-size-xs);
    flex-shrink: 0;
  }

  &__tags {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }

  &__tag {
    padding: 2px 8px;
    font-size: var(--font-size-xs);
    color: var(--accent);
    background: var(--accent-light);
    border-radius: var(--radius-sm);
  }

  &__footer {
    padding: var(--space-3);
    border-top: 1px solid var(--border-color);
    display: flex;
    justify-content: flex-end;
  }

  &__paste {
    padding: 6px 16px;
    font-size: var(--font-size-sm);
    color: #fff;
    background: var(--accent);
    border-radius: var(--radius-sm);

    &:hover:not(:disabled) {
      background: var(--accent-hover);
    }

    &:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
  }
}
</style>
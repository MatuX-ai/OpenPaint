<!--
  NewCanvasDialog — 新建画布向导。
  - 预设尺寸列表（社交 1080×1080、Web 1920×1080、A4 210×297mm、iOS Icon 1024×1024）
  - 自定义模式：宽 × 高（像素或毫米）+ DPI（72 / 144 / 300）
  - 旧图层处理：保留裁切 / 丢弃新建空白 / 取消

  关联需求：docs/ux-onboarding-requirements.md US-2。
-->

<script setup lang="ts">
import { ref, computed } from 'vue';
import AppModal from '@components/common/AppModal.vue';
import AppButton from '@components/common/AppButton.vue';
import { useCanvasStore } from '@stores/canvasStore';

defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:open', v: boolean): void;
  (e: 'confirm', v: {
    width: number;
    height: number;
    unit: 'px' | 'mm';
    dpi: 72 | 144 | 300;
    handleLayers: 'crop' | 'discard' | 'cancel';
  }): void;
}>();

type Preset = {
  id: string;
  label: string;
  description: string;
  width: number;
  height: number;
  unit: 'px' | 'mm';
  dpi: 72 | 144 | 300;
};

const PRESETS: Preset[] = [
  { id: 'social-square', label: '社交媒体 1080×1080', description: 'Instagram / 小红书 / 微信封面', width: 1080, height: 1080, unit: 'px', dpi: 72 },
  { id: 'web-banner', label: 'Web 横幅 1920×1080', description: '网页 hero 区、博客封面', width: 1920, height: 1080, unit: 'px', dpi: 72 },
  { id: 'a4', label: 'A4 (210×297mm)', description: '打印海报、传单', width: 210, height: 297, unit: 'mm', dpi: 300 },
  { id: 'ios-icon', label: 'iOS App Icon 1024×1024', description: 'App Store 主图标', width: 1024, height: 1024, unit: 'px', dpi: 72 },
];

const canvasStore = useCanvasStore();

const selectedId = ref<string>('social-square');
const customMode = ref(false);
const customW = ref(1280);
const customH = ref(720);
const customUnit = ref<'px' | 'mm'>('px');
const customDpi = ref<72 | 144 | 300>(72);

const hasLayers = computed(() => canvasStore.layerList.length > 0);
const handleLayers = ref<'crop' | 'discard'>('crop');

const finalDims = computed(() => {
  if (customMode.value) {
    return { width: customW.value, height: customH.value, unit: customUnit.value, dpi: customDpi.value };
  }
  const p = PRESETS.find((x) => x.id === selectedId.value) ?? PRESETS[0];
  return { width: p.width, height: p.height, unit: p.unit, dpi: p.dpi };
});

function selectPreset(id: string): void {
  selectedId.value = id;
  customMode.value = false;
}

function onConfirm(): void {
  emit('confirm', {
    width: finalDims.value.width,
    height: finalDims.value.height,
    unit: finalDims.value.unit as 'px' | 'mm',
    dpi: finalDims.value.dpi as 72 | 144 | 300,
    handleLayers: hasLayers.value ? handleLayers.value : 'discard',
  });
}

function onCancel(): void {
  emit('update:open', false);
}
</script>

<template>
  <AppModal :open="open" title="新建画布" :width="520" @update:open="emit('update:open', $event)">
    <div class="new-canvas">
      <section class="new-canvas__section">
        <h3 class="new-canvas__label">预设尺寸</h3>
        <div class="new-canvas__presets">
          <button
            v-for="p in PRESETS"
            :key="p.id"
            type="button"
            class="new-canvas__preset"
            :class="{ 'is-active': !customMode && selectedId === p.id }"
            @click="selectPreset(p.id)"
          >
            <div class="new-canvas__preset-label">{{ p.label }}</div>
            <div class="new-canvas__preset-desc">{{ p.description }}</div>
          </button>
        </div>
      </section>

      <section class="new-canvas__section">
        <button
          type="button"
          class="new-canvas__custom-toggle"
          :class="{ 'is-active': customMode }"
          @click="customMode = !customMode"
        >
          自定义尺寸…
        </button>
        <div v-if="customMode" class="new-canvas__custom">
          <label class="new-canvas__field">
            <span>宽</span>
            <input v-model.number="customW" type="number" min="1" max="20000" />
          </label>
          <label class="new-canvas__field">
            <span>高</span>
            <input v-model.number="customH" type="number" min="1" max="20000" />
          </label>
          <label class="new-canvas__field">
            <span>单位</span>
            <select v-model="customUnit">
              <option value="px">像素 (px)</option>
              <option value="mm">毫米 (mm)</option>
            </select>
          </label>
          <label class="new-canvas__field">
            <span>DPI</span>
            <select v-model.number="customDpi">
              <option :value="72">72 (屏幕)</option>
              <option :value="144">144 (Retina)</option>
              <option :value="300">300 (打印)</option>
            </select>
          </label>
        </div>
      </section>

      <section v-if="hasLayers" class="new-canvas__section">
        <h3 class="new-canvas__label">现有图层（{{ canvasStore.layerList.length }}）</h3>
        <div class="new-canvas__layer-opts">
          <label>
            <input v-model="handleLayers" type="radio" value="crop" />
            <span>保留并裁切到新尺寸</span>
          </label>
          <label>
            <input v-model="handleLayers" type="radio" value="discard" />
            <span>丢弃，新建空白画布</span>
          </label>
        </div>
      </section>

      <p class="new-canvas__preview">
        将创建
        <strong>{{ finalDims.width }} × {{ finalDims.height }} {{ finalDims.unit }}</strong>
        画布，DPI {{ finalDims.dpi }}。
      </p>
    </div>

    <template #footer>
      <AppButton variant="ghost" @click="onCancel">取消</AppButton>
      <AppButton variant="primary" @click="onConfirm">创建</AppButton>
    </template>
  </AppModal>
</template>

<style scoped lang="scss">
.new-canvas {
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
    transition: border-color var(--transition-fast);

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

  &__custom-toggle {
    font-size: var(--font-size-sm);
    color: var(--accent);

    &.is-active {
      color: var(--text-primary);
    }
  }

  &__custom {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-2);
    margin-top: var(--space-2);
  }

  &__field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    font-size: var(--font-size-xs);
    color: var(--text-secondary);

    input,
    select {
      height: 28px;
      padding: 0 var(--space-2);
      background: var(--bg-primary);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-sm);
    }
  }

  &__layer-opts {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    font-size: var(--font-size-sm);

    label {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      cursor: pointer;
    }
  }

  &__preview {
    margin: 0;
    padding: var(--space-2) var(--space-3);
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    background: var(--bg-primary);
    border-radius: var(--radius-sm);

    strong {
      color: var(--text-primary);
    }
  }
}
</style>

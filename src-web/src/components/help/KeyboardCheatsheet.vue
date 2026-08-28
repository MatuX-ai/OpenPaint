<!--
  KeyboardCheatsheet — 快捷键速查面板（US-10）。
  按 `?` 触发；分组列出全部快捷键。
-->

<script setup lang="ts">
import AppModal from '@components/common/AppModal.vue';

defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: 'update:open', v: boolean): void }>();

interface Group {
  title: string;
  items: { keys: string; label: string }[];
}

const GROUPS: Group[] = [
  {
    title: '文件',
    items: [
      { keys: 'Ctrl + N', label: '新建画布' },
      { keys: 'Ctrl + O', label: '打开本地图片' },
      { keys: 'Ctrl + S', label: '保存到图库' },
      { keys: 'Ctrl + Shift + S', label: '另存为本地' },
      { keys: 'Ctrl + E', label: '导出 PNG' },
      { keys: 'Ctrl + Shift + E', label: '批量导出' },
    ],
  },
  {
    title: '编辑',
    items: [
      { keys: 'Ctrl + Z', label: '撤销' },
      { keys: 'Ctrl + Shift + Z / Ctrl + Y', label: '重做' },
      { keys: 'Ctrl + A', label: '全选' },
      { keys: 'Ctrl + D', label: '取消选区' },
      { keys: 'Ctrl + C / Ctrl + V', label: '复制 / 粘贴' },
    ],
  },
  {
    title: '工具',
    items: [
      { keys: 'V', label: '选择工具' },
      { keys: 'M', label: '矩形选区' },
      { keys: 'B', label: '画笔' },
      { keys: 'E', label: '橡皮' },
      { keys: 'H', label: '移动工具' },
      { keys: 'T', label: '变形' },
    ],
  },
  {
    title: '视图',
    items: [
      { keys: '+ / -', label: '放大 / 缩小' },
      { keys: 'Ctrl + 0', label: '缩放至 100%' },
      { keys: 'Ctrl + Shift + 0', label: '适配窗口' },
      { keys: 'Space + 拖拽', label: '平移画布' },
      { keys: 'F11', label: '全屏' },
    ],
  },
  {
    title: '面板',
    items: [
      { keys: 'Ctrl + K', label: 'AI 助理显隐' },
      { keys: 'Ctrl + G', label: '图库面板' },
      { keys: 'Ctrl + Alt + P', label: 'OpenPencil 面板' },
    ],
  },
  {
    title: '帮助',
    items: [
      { keys: '?', label: '显示此面板' },
    ],
  },
];
</script>

<template>
  <AppModal :open="open" title="快捷键速查" :width="640" @update:open="emit('update:open', $event)">
    <div class="cheatsheet">
      <div v-for="g in GROUPS" :key="g.title" class="cheatsheet__group">
        <h3 class="cheatsheet__title">{{ g.title }}</h3>
        <dl class="cheatsheet__list">
          <div v-for="it in g.items" :key="it.keys" class="cheatsheet__row">
            <dt>
              <kbd
                v-for="(k, i) in it.keys.split(' / ')"
                :key="i"
                class="cheatsheet__kbd"
              >
                {{ k }}
              </kbd>
            </dt>
            <dd>{{ it.label }}</dd>
          </div>
        </dl>
      </div>
    </div>
  </AppModal>
</template>

<style scoped lang="scss">
.cheatsheet {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-4);

  &__group {
    break-inside: avoid;
  }

  &__title {
    margin: 0 0 var(--space-2);
    font-size: var(--font-size-xs);
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  &__list {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  &__row {
    display: grid;
    grid-template-columns: 1fr 1.4fr;
    align-items: center;
    padding: var(--space-1) 0;
    font-size: var(--font-size-sm);

    dt {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }

    dd {
      margin: 0;
      color: var(--text-secondary);
    }
  }

  &__kbd {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 22px;
    height: 22px;
    padding: 0 6px;
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    color: var(--text-primary);
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-bottom-width: 2px;
    border-radius: var(--radius-sm);
  }
}
</style>

<!--
  Confirm before converting vector nodes to a pixel IMAGE layer.
-->

<script setup lang="ts">
import { computed } from 'vue';
import AppModal from '@components/common/AppModal.vue';
import AppButton from '@components/common/AppButton.vue';
import {
  decideRasterizeConfirm,
  useRasterizeConfirmState,
} from '@composables/useRasterizeConfirm';

const { open, request } = useRasterizeConfirmState();

const message = computed(() => {
  const label = request.value?.label?.trim();
  const count = request.value?.nodeIds.length ?? 0;
  const subject = label
    ? `「${label}」`
    : count > 1
      ? `选中的 ${count} 个对象`
      : '选中的矢量对象';
  return `将把${subject}转换为像素图后再编辑。转换后无法再以矢量方式精调路径与文字。`;
});

function onOpenUpdate(v: boolean): void {
  if (!v) decideRasterizeConfirm(false);
}

function accept(): void {
  decideRasterizeConfirm(true);
}

function cancel(): void {
  decideRasterizeConfirm(false);
}
</script>

<template>
  <AppModal
    :open="open"
    title="转为像素图后编辑"
    :width="440"
    :dismissible="true"
    @update:open="onOpenUpdate"
  >
    <p class="rasterize-dialog__msg">{{ message }}</p>
    <p class="rasterize-dialog__hint">本次会话中，已确认过的对象不会再次询问。</p>
    <template #footer>
      <AppButton variant="ghost" @click="cancel">取消</AppButton>
      <AppButton variant="primary" @click="accept">转换为像素图并继续</AppButton>
    </template>
  </AppModal>
</template>

<style scoped lang="scss">
.rasterize-dialog__msg {
  margin: 0 0 var(--space-2);
  font-size: var(--font-size-sm);
  line-height: 1.6;
  color: var(--text-secondary);
}

.rasterize-dialog__hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-muted);
}
</style>

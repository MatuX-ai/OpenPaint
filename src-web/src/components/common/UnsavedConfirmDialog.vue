<!--
  UnsavedConfirmDialog — US-6 关闭未保存拦截。
  - 三选项：保存到图库 / 丢弃 / 取消
  - 由 AppView 在 onCloseRequested 时挂出
-->

<script setup lang="ts">
import AppModal from '@components/common/AppModal.vue';
import AppButton from '@components/common/AppButton.vue';

defineProps<{ open: boolean }>();
const emit = defineEmits<{
  (e: 'update:open', v: boolean): void;
  (e: 'decide', v: 'save' | 'discard' | 'cancel'): void;
}>();

function decide(v: 'save' | 'discard' | 'cancel'): void {
  emit('decide', v);
  emit('update:open', false);
}
</script>

<template>
  <AppModal
    :open="open"
    title="这份画布还没保存"
    :width="420"
    :dismissible="false"
    @update:open="emit('update:open', $event)"
  >
    <p class="unsaved-dialog__msg">继续关闭将丢失当前的笔触与改动。要保存到图库、丢弃还是取消？</p>
    <template #footer>
      <AppButton variant="ghost" @click="decide('cancel')">取消</AppButton>
      <AppButton variant="danger" @click="decide('discard')">丢弃</AppButton>
      <AppButton variant="primary" @click="decide('save')">保存到图库</AppButton>
    </template>
  </AppModal>
</template>

<style scoped lang="scss">
.unsaved-dialog__msg {
  margin: 0;
  font-size: var(--font-size-sm);
  line-height: 1.6;
  color: var(--text-secondary);
}
</style>

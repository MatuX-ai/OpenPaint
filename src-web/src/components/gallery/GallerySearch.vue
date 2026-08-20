<!--
  Gallery search bar — text query + tag filter.
-->

<script setup lang="ts">
import { ref, watch } from 'vue';
import { Search } from 'lucide-vue-next';
import { debounce } from '@utils/helpers';

const props = defineProps<{ modelValue: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: string]; search: [query: string] }>();

const local = ref(props.modelValue);

watch(
  () => props.modelValue,
  (v) => (local.value = v),
);

const runSearch = debounce(() => {
  emit('update:modelValue', local.value);
  emit('search', local.value);
}, 250);
</script>

<template>
  <div class="gallery-search">
    <Search :size="14" class="gallery-search__icon" />
    <input
      v-model="local"
      class="gallery-search__input"
      type="search"
      placeholder="搜索图库…"
      @input="runSearch"
    />
  </div>
</template>

<style scoped lang="scss">
.gallery-search {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2);
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-secondary);

  &__icon {
    color: var(--text-muted);
    flex-shrink: 0;
  }

  &__input {
    flex: 1;
    min-width: 0;
    padding: var(--space-1) 0;
    font-size: var(--font-size-sm);
    color: var(--text-primary);
    background: transparent;
    border: none;
    outline: none;

    &::placeholder {
      color: var(--text-muted);
    }
  }
}
</style>

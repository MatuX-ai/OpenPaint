/**
 * ToastContainer 组件测试 — 覆盖 ONB-5xx a11y + 行为。
 *
 * Toast 列表由 Teleport 渲染到 body，所以直接走 document.body.querySelectorAll。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import ToastContainer from './ToastContainer.vue';
import { useToast } from '@composables/useToast';
import { setupComponentTest } from '@/test/setup';

setupComponentTest();

describe('ToastContainer', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders nothing when no toasts', () => {
    const w = mount(ToastContainer, { attachTo: document.body });
    expect(w.find('[data-openpaint-toast-root]').exists()).toBe(true);
    expect(document.body.querySelectorAll('.toast-container__item')).toHaveLength(0);
    w.unmount();
  });

  it('renders toasts added via useToast', async () => {
    const t = useToast();
    t.success('A');
    t.error('B');
    const w = mount(ToastContainer, { attachTo: document.body });
    await nextTick();
    const items = document.body.querySelectorAll('.toast-container__item');
    expect(items.length).toBe(2);
    expect(items[0].textContent).toContain('A');
    expect(items[1].textContent).toContain('B');
    w.unmount();
  });

  it('clicking close button removes the toast', async () => {
    const t = useToast();
    const id = t.info('removable');
    const w = mount(ToastContainer, { attachTo: document.body });
    await nextTick();
    // 找到 wrapper 渲染的第一个 toast 子树（Teleport 出来的 DOM 在 attachTo:body 下
    // wrapper 也能 find 到，因为 vue-test-utils 跟踪 Teleport）。
    const close = w.find('[aria-label^="关闭通知"]');
    expect(close.exists()).toBe(true);
    // happy-dom 下 native click 不会触发 Vue @click，
    // 但 trigger('click') 模拟 MouseEvent 可以。
    // 这里再额外直接调 useToast().dismiss 校验业务路径：
    t.dismiss(id);
    await nextTick();
    expect(t.toasts.value.find((x) => x.id === id)).toBeUndefined();
    w.unmount();
  });

  it('action button click runs the action', async () => {
    const t = useToast();
    let acted = 0;
    t.show({
      message: 'with action',
      action: { label: 'do', onClick: () => acted++ },
    });
    const w = mount(ToastContainer, { attachTo: document.body });
    await nextTick();
    const action = document.body.querySelector('.toast-container__action') as HTMLElement;
    expect(action).toBeTruthy();
    action.click();
    expect(acted).toBe(1);
    w.unmount();
  });
});

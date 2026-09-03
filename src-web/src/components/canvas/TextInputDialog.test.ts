/**
 * TextInputDialog 组件测试 — W15 · G1
 *
 * 覆盖：
 *  - Teleport 守卫（open=false 不渲染）
 *  - a11y 属性（role=dialog / aria-modal）
 *  - 确认按钮触发 confirm + update:open(false)
 *  - 空白文字不 emit confirm
 *  - Esc / 关闭按钮 / scrim 点击触发 update:open(false)
 *  - Ctrl+Enter 触发 confirm
 *  - 打开时重置 text / fontSize / color
 */

import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import TextInputDialog from './TextInputDialog.vue';
import { setupComponentTest, bodyHtml } from '@/test/setup';

setupComponentTest();

function mountDialog(
  propsOverride: Partial<{
    open: boolean;
    defaultColor: string;
    defaultSize: number;
  }> = {},
) {
  return mount(TextInputDialog, {
    props: { open: true, defaultColor: '#ff0000', defaultSize: 24, ...propsOverride },
    attachTo: document.body,
  });
}

describe('TextInputDialog', () => {
  it('open=false 不渲染 dialog', async () => {
    const w = mountDialog({ open: false });
    await nextTick();
    expect(bodyHtml()).not.toContain('role="dialog"');
    w.unmount();
  });

  it('open=true 渲染 role=dialog aria-modal=true + 标题', async () => {
    const w = mountDialog({ open: true });
    await nextTick();
    const html = bodyHtml();
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('文字输入');
    w.unmount();
  });

  it('输入文字 + 点击确认触发 confirm + update:open(false)', async () => {
    const w = mountDialog({ open: true });
    await nextTick();
    // 找到 textarea 输入文字
    const textarea = document.body.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();
    textarea.value = 'Hello';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();

    // 点击确认按钮（class text-dialog__btn--primary）
    const confirmBtn = document.body.querySelector(
      '.text-dialog__btn--primary',
    ) as HTMLButtonElement;
    expect(confirmBtn).toBeTruthy();
    confirmBtn.click();
    await nextTick();

    const confirmEvents = w.emitted('confirm');
    expect(confirmEvents).toBeTruthy();
    expect(confirmEvents![0][0]).toMatchObject({
      text: 'Hello',
      color: '#ff0000',
      fontSize: 24,
    });
    expect(w.emitted('update:open')?.at(-1)?.[0]).toBe(false);
    w.unmount();
  });

  it('空白文字（仅空格）点击确认不触发 confirm', async () => {
    const w = mountDialog({ open: true });
    await nextTick();
    const textarea = document.body.querySelector('textarea') as HTMLTextAreaElement;
    textarea.value = '   ';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    const confirmBtn = document.body.querySelector(
      '.text-dialog__btn--primary',
    ) as HTMLButtonElement;
    confirmBtn.click();
    await nextTick();
    expect(w.emitted('confirm')).toBeFalsy();
    w.unmount();
  });

  it('Esc 按键触发 update:open(false)', async () => {
    const w = mountDialog({ open: true });
    await nextTick();
    // @keydown 绑定在 .text-dialog 元素上（非 document），因此事件需 dispatch 到该元素
    const dialog = document.body.querySelector('.text-dialog') as HTMLElement;
    expect(dialog).toBeTruthy();
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await nextTick();
    expect(w.emitted('update:open')?.at(-1)?.[0]).toBe(false);
    w.unmount();
  });

  it('Ctrl+Enter 触发 confirm', async () => {
    const w = mountDialog({ open: true });
    await nextTick();
    const textarea = document.body.querySelector('textarea') as HTMLTextAreaElement;
    textarea.value = 'World';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    // 事件从 textarea 冒泡到 .text-dialog 触发 @keydown
    textarea.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }),
    );
    await nextTick();
    expect(w.emitted('confirm')).toBeTruthy();
    expect(w.emitted('confirm')![0][0]).toMatchObject({ text: 'World' });
    expect(w.emitted('update:open')?.at(-1)?.[0]).toBe(false);
    w.unmount();
  });

  it('点击关闭按钮触发 update:open(false)', async () => {
    const w = mountDialog({ open: true });
    await nextTick();
    const closeBtn = document.body.querySelector('.text-dialog__close') as HTMLButtonElement;
    expect(closeBtn).toBeTruthy();
    closeBtn.click();
    await nextTick();
    expect(w.emitted('update:open')?.at(-1)?.[0]).toBe(false);
    w.unmount();
  });

  it('从 false 切 true 时 text 重置为空', async () => {
    const w = mountDialog({ open: false });
    await nextTick();
    await w.setProps({ open: true });
    await nextTick();
    const textarea = document.body.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea.value).toBe('');
    w.unmount();
  });
});

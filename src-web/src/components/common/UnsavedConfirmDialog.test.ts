/**
 * UnsavedConfirmDialog 组件测试 — 覆盖 ONB-304 / ONB-305 / ONB-306。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import UnsavedConfirmDialog from './UnsavedConfirmDialog.vue';
import { setupComponentTest, bodyText } from '@/test/setup';

setupComponentTest();

describe('UnsavedConfirmDialog', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders title and three actions', () => {
    mount(UnsavedConfirmDialog, { props: { open: true }, attachTo: document.body });
    const t = bodyText();
    expect(t).toContain('这份画布还没保存');
    expect(t).toContain('取消');
    expect(t).toContain('丢弃');
    expect(t).toContain('保存到图库');
  });

  it('clicking 保存到图库 emits decide=save and closes', async () => {
    const w = mount(UnsavedConfirmDialog, { props: { open: true }, attachTo: document.body });
    const primary = document.body.querySelectorAll('.app-btn--primary')[0] as HTMLElement;
    primary.click();
    await nextTick();
    expect(w.emitted('decide')?.[0]?.[0]).toBe('save');
    expect(w.emitted('update:open')?.at(-1)?.[0]).toBe(false);
  });

  it('clicking 丢弃 emits decide=discard', async () => {
    const w = mount(UnsavedConfirmDialog, { props: { open: true }, attachTo: document.body });
    const danger = document.body.querySelectorAll('.app-btn--danger')[0] as HTMLElement;
    danger.click();
    await nextTick();
    expect(w.emitted('decide')?.[0]?.[0]).toBe('discard');
  });

  it('clicking 取消 emits decide=cancel', async () => {
    const w = mount(UnsavedConfirmDialog, { props: { open: true }, attachTo: document.body });
    const ghost = document.body.querySelectorAll('.app-btn--ghost')[0] as HTMLElement;
    ghost.click();
    await nextTick();
    expect(w.emitted('decide')?.[0]?.[0]).toBe('cancel');
  });

  it('dismissible=false: scrim click does not close', async () => {
    const w = mount(UnsavedConfirmDialog, { props: { open: true }, attachTo: document.body });
    const scrim = document.body.querySelector('.app-modal__scrim') as HTMLElement;
    scrim.click();
    await nextTick();
    expect(w.emitted('update:open')).toBeUndefined();
  });
});

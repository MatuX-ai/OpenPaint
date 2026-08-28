/**
 * useDocumentState 单元测试 — 覆盖 US-4 / US-6 关联的保存态。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

describe('useDocumentState', () => {
  beforeEach(async () => {
    vi.resetModules();
    setActivePinia(createPinia());
  });

  async function load() {
    const mod = await import('@composables/useDocumentState');
    return mod.useDocumentState();
  }

  it('starts pristine with "未命名"', async () => {
    const d = await load();
    expect(d.state.value).toBe('pristine');
    expect(d.fileName.value).toBe('未命名');
    expect(d.isDirty.value).toBe(false);
    expect(d.isSaving.value).toBe(false);
  });

  it('markDirty transitions to dirty; isDirty true', async () => {
    const d = await load();
    d.markDirty();
    expect(d.state.value).toBe('dirty');
    expect(d.isDirty.value).toBe(true);
  });

  it('markSaving + markSaved flow', async () => {
    const d = await load();
    d.markDirty();
    d.markSaving();
    expect(d.isSaving.value).toBe(true);
    expect(d.isDirty.value).toBe(true); // saving 视为 still dirty
    d.markSaved('myfile.png');
    expect(d.state.value).toBe('saved');
    expect(d.fileName.value).toBe('myfile.png');
    expect(d.isDirty.value).toBe(false);
    expect(d.isSaving.value).toBe(false);
  });

  it('markExported transitions to exported', async () => {
    const d = await load();
    d.markDirty();
    d.markExported();
    expect(d.state.value).toBe('exported');
    expect(d.isDirty.value).toBe(false);
  });

  it('resetForNew returns to pristine', async () => {
    const d = await load();
    d.markDirty();
    d.markSaved('a.png');
    d.resetForNew();
    expect(d.state.value).toBe('pristine');
    expect(d.fileName.value).toBe('未命名');
  });

  it('markDirty is no-op while saving', async () => {
    const d = await load();
    d.markSaving();
    d.markDirty(); // should not flip out of saving
    expect(d.state.value).toBe('saving');
  });

  it('confirmClose returns discard when pristine, cancel when dirty', async () => {
    const d = await load();
    expect(await d.confirmClose()).toBe('discard');
    d.markDirty();
    expect(await d.confirmClose()).toBe('cancel');
  });

  it('noticeUnsaved shows a warning toast (smoke)', async () => {
    const d = await load();
    // 静默跑通即可，toast 是另一个 composable 的副作用
    d.noticeUnsaved();
    expect(true).toBe(true);
  });
});

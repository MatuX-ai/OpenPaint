/**
 * OnboardingCard 组件测试 — 覆盖 US-1 / ONB-101 ~ ONB-105。
 */

import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import OnboardingCard from './OnboardingCard.vue';
import { setupComponentTest } from '@/test/setup';

setupComponentTest();

describe('OnboardingCard', () => {
  it('renders title and three actions', () => {
    const w = mount(OnboardingCard);
    expect(w.text()).toContain('从一张画布开始');
    expect(w.text()).toContain('新建');
    expect(w.text()).toContain('打开');
    expect(w.text()).toContain('让 AI 来画');
  });

  it('emits new / open / ai events', async () => {
    const w = mount(OnboardingCard);
    const buttons = w.findAll('.onboarding__action');
    expect(buttons).toHaveLength(3);
    await buttons[0].trigger('click');
    expect(w.emitted('new')).toHaveLength(1);
    await buttons[1].trigger('click');
    expect(w.emitted('open')).toHaveLength(1);
    await buttons[2].trigger('click');
    expect(w.emitted('ai')).toHaveLength(1);
  });

  it('markCompleted is called after any pick (persists)', async () => {
    const w = mount(OnboardingCard);
    await w.findAll('.onboarding__action')[0].trigger('click');
    await nextTick();
    const raw = localStorage.getItem('openpaint:onboarding');
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw as string).completed).toBe(true);
  });

  it('each action button has aria-label', () => {
    const w = mount(OnboardingCard);
    expect(w.findAll('[aria-label="新建画布"]')).toHaveLength(1);
    expect(w.findAll('[aria-label="打开本地图片"]')).toHaveLength(1);
    expect(w.findAll('[aria-label="让 AI 帮我画"]')).toHaveLength(1);
  });
});

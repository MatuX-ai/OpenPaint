/**
 * AppButton 组件测试。
 */

import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import AppButton from './AppButton.vue';

describe('AppButton', () => {
  it('renders slot content', () => {
    const w = mount(AppButton, { slots: { default: '点击' } });
    expect(w.text()).toBe('点击');
  });

  it('emits click event when clicked and not disabled', async () => {
    const onClick = vi.fn();
    const w = mount(AppButton, { attrs: { onClick } });
    await w.trigger('click');
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not emit click when disabled', async () => {
    const onClick = vi.fn();
    const w = mount(AppButton, { props: { disabled: true }, attrs: { onClick } });
    await w.trigger('click');
    expect(onClick).not.toHaveBeenCalled();
  });

  it('shows spinner and disables when loading', () => {
    const w = mount(AppButton, { props: { loading: true }, slots: { default: 'X' } });
    expect(w.find('.app-btn__spinner').exists()).toBe(true);
    expect(w.attributes('disabled')).toBeDefined();
  });

  it('applies variant + size classes', () => {
    const w = mount(AppButton, { props: { variant: 'primary', size: 'sm' } });
    expect(w.classes()).toContain('app-btn--primary');
    expect(w.classes()).toContain('app-btn--sm');
  });
});

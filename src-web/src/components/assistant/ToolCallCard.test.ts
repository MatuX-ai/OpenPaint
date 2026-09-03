/**
 * ToolCallCard attribution tests (W10-E3).
 */

import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ToolCallCard from '@/components/assistant/ToolCallCard.vue';
import type { ToolCall } from '@/types/agent';

function makeCall(overrides: Partial<ToolCall> = {}): ToolCall {
  return {
    id: 'c1',
    name: 'search_icons',
    arguments: { query: 'home' },
    status: 'success',
    result: 'found 3',
    ...overrides,
  };
}

describe('ToolCallCard', () => {
  it('TC-101: default attribution (user) — no AI tag', () => {
    const w = mount(ToolCallCard, { props: { call: makeCall() } });
    expect(w.find('.tool-call-card__agent-tag').exists()).toBe(false);
    expect(w.find('.tool-call-card').classes()).not.toContain('tool-call-card--agent');
  });

  it('TC-102: attribution="agent" — shows AI tag + agent class', () => {
    const w = mount(ToolCallCard, { props: { call: makeCall(), attribution: 'agent' } });
    const tag = w.find('.tool-call-card__agent-tag');
    expect(tag.exists()).toBe(true);
    expect(tag.text()).toContain('AI');
    expect(w.find('.tool-call-card').classes()).toContain('tool-call-card--agent');
  });
});

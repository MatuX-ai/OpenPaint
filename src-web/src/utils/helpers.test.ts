/**
 * 工具函数单元测试
 */

import { describe, it, expect } from 'vitest';
import { debounce, throttle, uuid } from '@/utils/helpers';

describe('helpers', () => {
  it('debounce delays execution', async () => {
    let count = 0;
    const fn = debounce(() => count++, 50);
    fn();
    fn();
    fn();
    await new Promise((r) => setTimeout(r, 100));
    expect(count).toBe(1);
  });

  it('throttle limits execution rate', () => {
    let count = 0;
    const fn = throttle(() => count++, 50);
    fn();
    fn();
    fn();
    expect(count).toBe(1);
  });

  it('uuid returns valid format', () => {
    const id = uuid();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });
});

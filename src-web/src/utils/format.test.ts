/**
 * format.ts 工具函数单元测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { formatTimestamp, formatRelative, formatBytes } from '@/utils/format';

describe('format utilities', () => {
  describe('formatTimestamp', () => {
    it('should format timestamp with default locale (zh-CN)', () => {
      // Use a fixed timestamp: 2024-01-15 12:30:00 UTC
      const ts = new Date('2024-01-15T12:30:00Z').getTime();
      const result = formatTimestamp(ts);

      // Result should be a non-empty string
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });

    it('should format timestamp with specified locale', () => {
      const ts = new Date('2024-06-20T15:45:00Z').getTime();
      const result = formatTimestamp(ts, 'en-US');

      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });

    it('should handle zero timestamp (Unix epoch)', () => {
      const result = formatTimestamp(0);

      expect(result).toBeTruthy();
      // Should represent Jan 1, 1970
    });

    it('should handle current timestamp', () => {
      const now = Date.now();
      const result = formatTimestamp(now);

      expect(result).toBeTruthy();
    });

    it('should handle future timestamps', () => {
      const future = Date.now() + 86400000; // tomorrow
      const result = formatTimestamp(future);

      expect(result).toBeTruthy();
    });
  });

  describe('formatRelative', () => {
    let originalDateNow: typeof Date.now;

    beforeEach(() => {
      originalDateNow = Date.now;
    });

    afterEach(() => {
      Date.now = originalDateNow;
    });

    it('should return "刚刚" for very recent timestamps', () => {
      const now = 1700000000000;
      Date.now = () => now;

      const result = formatRelative(now - 10000); // 10 seconds ago

      expect(result).toBe('刚刚');
    });

    it('should return minutes for timestamps less than an hour ago', () => {
      const now = 1700000000000;
      Date.now = () => now;

      const fiveMinutesAgo = now - 5 * 60 * 1000;
      const result = formatRelative(fiveMinutesAgo);

      expect(result).toBe('5 分钟前');
    });

    it('should return hours for timestamps less than a day ago', () => {
      const now = 1700000000000;
      Date.now = () => now;

      const threeHoursAgo = now - 3 * 60 * 60 * 1000;
      const result = formatRelative(threeHoursAgo);

      expect(result).toBe('3 小时前');
    });

    it('should return days for timestamps more than a day ago', () => {
      const now = 1700000000000;
      Date.now = () => now;

      const twoDaysAgo = now - 2 * 24 * 60 * 60 * 1000;
      const result = formatRelative(twoDaysAgo);

      expect(result).toBe('2 天前');
    });

    it('should handle exactly one minute ago', () => {
      const now = 1700000000000;
      Date.now = () => now;

      const oneMinuteAgo = now - 60 * 1000;
      const result = formatRelative(oneMinuteAgo);

      expect(result).toBe('1 分钟前');
    });

    it('should handle exactly one hour ago', () => {
      const now = 1700000000000;
      Date.now = () => now;

      const oneHourAgo = now - 60 * 60 * 1000;
      const result = formatRelative(oneHourAgo);

      expect(result).toBe('1 小时前');
    });

    it('should handle exactly one day ago', () => {
      const now = 1700000000000;
      Date.now = () => now;

      const oneDayAgo = now - 24 * 60 * 60 * 1000;
      const result = formatRelative(oneDayAgo);

      expect(result).toBe('1 天前');
    });

    it('should handle many days ago', () => {
      const now = 1700000000000;
      Date.now = () => now;

      const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
      const result = formatRelative(thirtyDaysAgo);

      expect(result).toBe('30 天前');
    });
  });

  describe('formatBytes', () => {
    it('should format bytes correctly', () => {
      expect(formatBytes(0)).toBe('0 B');
      expect(formatBytes(1)).toBe('1 B');
      expect(formatBytes(500)).toBe('500 B');
      expect(formatBytes(1023)).toBe('1023 B');
    });

    it('should format kilobytes correctly', () => {
      expect(formatBytes(1024)).toBe('1.0 KB');
      expect(formatBytes(1536)).toBe('1.5 KB');
      expect(formatBytes(10240)).toBe('10.0 KB');
      expect(formatBytes(102400)).toBe('100.0 KB');
    });

    it('should format megabytes correctly', () => {
      expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
      expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.5 MB');
      expect(formatBytes(10 * 1024 * 1024)).toBe('10.0 MB');
    });

    it('should format gigabytes correctly', () => {
      expect(formatBytes(1024 * 1024 * 1024)).toBe('1.00 GB');
      expect(formatBytes(1.5 * 1024 * 1024 * 1024)).toBe('1.50 GB');
      expect(formatBytes(10 * 1024 * 1024 * 1024)).toBe('10.00 GB');
    });

    it('should handle boundary values', () => {
      // Just below KB threshold
      expect(formatBytes(1023)).toBe('1023 B');
      // Exactly at KB threshold
      expect(formatBytes(1024)).toBe('1.0 KB');
      // Just above KB threshold
      expect(formatBytes(1025)).toBe('1.0 KB');

      // Just below MB threshold
      expect(formatBytes(1024 * 1024 - 1)).toBe('1024.0 KB');
      // Exactly at MB threshold
      expect(formatBytes(1024 * 1024)).toBe('1.0 MB');

      // Just below GB threshold
      expect(formatBytes(1024 * 1024 * 1024 - 1)).toBe('1024.0 MB');
      // Exactly at GB threshold
      expect(formatBytes(1024 * 1024 * 1024)).toBe('1.00 GB');
    });

    it('should handle large values', () => {
      const terabyte = 1024 * 1024 * 1024 * 1024;
      expect(formatBytes(terabyte)).toBe('1024.00 GB');
    });

    it('should handle decimal precision', () => {
      // KB shows 1 decimal
      expect(formatBytes(1280)).toBe('1.3 KB'); // 1280 / 1024 = 1.25 -> toFixed(1) rounds to 1.3

      // GB shows 2 decimals
      expect(formatBytes(1.234 * 1024 * 1024 * 1024)).toBe('1.23 GB');
    });
  });
});

import { describe, expect, it } from 'vitest';
import { formatDuration, formatNumber } from '../src/core/format';

describe('formatNumber', () => {
  it('shows whole numbers below 1,000, rounded down', () => {
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(7.9)).toBe('7');
    expect(formatNumber(999.99)).toBe('999');
  });

  it('uses three significant digits with a suffix from 1,000 up', () => {
    expect(formatNumber(1000)).toBe('1.00K');
    expect(formatNumber(1234)).toBe('1.23K');
    expect(formatNumber(12_345)).toBe('12.3K');
    expect(formatNumber(123_456)).toBe('123K');
    expect(formatNumber(1_000_000)).toBe('1.00M');
    expect(formatNumber(4.56e9)).toBe('4.56B');
    expect(formatNumber(7.89e12)).toBe('7.89T');
  });

  it('rounds down so players never see more than they have', () => {
    expect(formatNumber(999_999)).toBe('999K');
    expect(formatNumber(1999)).toBe('1.99K');
    expect(formatNumber(999_999_999)).toBe('999M');
  });

  it('switches to letter pairs after Dc', () => {
    expect(formatNumber(1e33)).toBe('1.00Dc');
    expect(formatNumber(1e36)).toBe('1.00aa');
    expect(formatNumber(2.5e39)).toBe('2.50ab');
    expect(formatNumber(1e300)).toMatch(/^1\.00[a-z]{2}$/);
  });

  it('handles negatives and non-finite values', () => {
    expect(formatNumber(-1234)).toBe('-1.23K');
    expect(formatNumber(-5)).toBe('-5');
    expect(formatNumber(Infinity)).toBe('∞');
    expect(formatNumber(Number.NaN)).toBe('?');
  });
});

describe('formatDuration', () => {
  it('formats seconds, minutes, hours and days', () => {
    expect(formatDuration(0)).toBe('0s');
    expect(formatDuration(45.9)).toBe('45s');
    expect(formatDuration(192)).toBe('3m 12s');
    expect(formatDuration(2 * 3600 + 5 * 60)).toBe('2h 05m');
    expect(formatDuration(3 * 86400 + 4 * 3600)).toBe('3d 04h');
  });

  it('treats negative or invalid input as zero', () => {
    expect(formatDuration(-10)).toBe('0s');
    expect(formatDuration(Number.NaN)).toBe('0s');
  });
});

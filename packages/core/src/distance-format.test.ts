import { describe, it, expect } from 'vitest';
import { formatDistance } from './distance-format';

describe('formatDistance', () => {
  it('formats distances under 1000m as meters', () => {
    expect(formatDistance(0)).toBe('0m');
    expect(formatDistance(12)).toBe('12m');
    expect(formatDistance(999)).toBe('999m');
  });

  it('rounds decimal meters', () => {
    expect(formatDistance(150.4)).toBe('150m');
    expect(formatDistance(150.6)).toBe('151m');
  });

  it('formats distances 1000m and over as kilometers with 1 decimal place', () => {
    expect(formatDistance(1000)).toBe('1km');
    expect(formatDistance(1200)).toBe('1.2km');
    expect(formatDistance(1250)).toBe('1.3km');
    expect(formatDistance(25000)).toBe('25km');
  });

  it('throws on negative distances', () => {
    expect(() => formatDistance(-10)).toThrow('Distance cannot be negative');
  });
});

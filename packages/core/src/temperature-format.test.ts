import { describe, it, expect } from 'vitest';
import { formatTemperature } from './temperature-format';

describe('formatTemperature', () => {
  it('formats positive temperatures', () => {
    expect(formatTemperature(25)).toBe('25°C');
    expect(formatTemperature(32.4)).toBe('32°C');
    expect(formatTemperature(32.6)).toBe('33°C');
  });

  it('formats negative temperatures', () => {
    expect(formatTemperature(-5)).toBe('-5°C');
    expect(formatTemperature(-12.8)).toBe('-13°C');
  });

  it('formats zero', () => {
    expect(formatTemperature(0)).toBe('0°C');
  });
});

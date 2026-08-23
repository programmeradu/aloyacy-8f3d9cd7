import { describe, it, expect } from 'vitest';
import { formatDuration } from './duration-format';

describe('formatDuration', () => {
  it('formats under an hour as minutes', () => {
    expect(formatDuration(0)).toBe('0m');
    expect(formatDuration(60)).toBe('1m');
    expect(formatDuration(45 * 60)).toBe('45m');
  });

  it('rounds to nearest minute', () => {
    expect(formatDuration(89)).toBe('1m');
    expect(formatDuration(90)).toBe('2m');
  });

  it('formats exact hours', () => {
    expect(formatDuration(60 * 60)).toBe('1h');
    expect(formatDuration(2 * 60 * 60)).toBe('2h');
  });

  it('formats hours and minutes', () => {
    expect(formatDuration(60 * 60 + 15 * 60)).toBe('1h 15m');
    expect(formatDuration(2 * 60 * 60 + 59 * 60)).toBe('2h 59m');
  });

  it('throws on negative duration', () => {
    expect(() => formatDuration(-60)).toThrow('Duration cannot be negative');
  });
});

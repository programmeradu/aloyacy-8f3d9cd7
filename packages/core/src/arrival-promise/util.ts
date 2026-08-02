// Small shared numeric/string helpers for the arrival-promise modules.

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, Math.round(n)));
}

export function minutes(sec: number): number {
  return Math.round(sec / 60);
}

export function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// JCC Smart logo: the official mark saved locally in public/brands/jcc.png
// (no third-party fetch, and never a text or letter fallback).
export function JccLogo({ className }: { className?: string }) {
  return (
    <img
      src="/brands/jcc.png"
      alt="JCC Smart"
      width={40}
      height={40}
      loading="lazy"
      decoding="async"
      className={`object-contain p-1 ${className ?? ""}`}
    />
  );
}

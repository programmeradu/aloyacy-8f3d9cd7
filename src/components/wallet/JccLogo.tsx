import { useState } from "react";

// JCC Smart logo via logo.dev (publishable key, safe to ship client-side).
// Falls back to a clean monogram tile if the image fails to load.
export function JccLogo({ className }: { className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div
        className={`flex items-center justify-center font-display text-ink ${className ?? ""}`}
      >
        <span className="text-[11px] tracking-tight">JCC</span>
      </div>
    );
  }
  return (
    <img
      src="https://img.logo.dev/jccsmart.com?token=pk_DFEjHHL4QteaMOzcFuSlwg&size=120&format=png"
      alt="JCC Smart"
      width={40}
      height={40}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={`object-contain p-1 ${className ?? ""}`}
    />
  );
}

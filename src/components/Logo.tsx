export function Logo({ className }: { className?: string }) {
  return (
    <div className={`flex items-baseline gap-1.5 ${className ?? ""}`}>
      <span className="font-display text-2xl italic leading-none text-ink">Aloya</span>
      <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-ink-soft pb-0.5">
        Cy Transit
      </span>
    </div>
  );
}

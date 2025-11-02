export function Logo({ className }: { className?: string }) {
  return (
    <div className={`flex items-baseline ${className ?? ""}`}>
      <span className="font-display text-2xl italic leading-none text-ink">Aloya</span>
    </div>
  );
}

import cyprusMap from "@/assets/cyprus-map.jpg";

type Pin = {
  top: string;
  left: string;
  code: string;
  tone: "aegean" | "ochre" | "olive";
  live?: boolean;
};

const toneBg: Record<Pin["tone"], string> = {
  aegean: "bg-aegean-deep",
  ochre: "bg-ochre",
  olive: "bg-olive",
};

const pins: Pin[] = [
  { top: "32%", left: "44%", code: "102", tone: "aegean", live: true },
  { top: "58%", left: "62%", code: "615", tone: "ochre" },
  { top: "70%", left: "30%", code: "30", tone: "olive" },
];

export function MapPreview({ height = "h-64" }: { height?: string }) {
  return (
    <div
      className={`relative w-full overflow-hidden rounded-[28px] ring-1 ring-line bg-limestone-soft ${height}`}
    >
      <img
        src={cyprusMap}
        alt="Map of Nicosia"
        loading="lazy"
        width={1024}
        height={1024}
        className="absolute inset-0 size-full object-cover opacity-95"
      />
      <div className="absolute inset-0 grain opacity-60" aria-hidden />

      {/* Subtle route trace */}
      <svg
        viewBox="0 0 400 260"
        className="absolute inset-0 size-full"
        preserveAspectRatio="none"
        aria-hidden
      >
        <path
          d="M40,210 C120,180 160,120 200,110 S 320,90 380,40"
          stroke="oklch(0.48 0.085 215)"
          strokeWidth="1.4"
          strokeDasharray="3 4"
          fill="none"
          opacity="0.55"
        />
      </svg>

      {pins.map((p) => (
        <div
          key={p.code}
          className="absolute -translate-x-1/2 -translate-y-full flex flex-col items-center"
          style={{ top: p.top, left: p.left }}
        >
          <div
            className={`mb-1 rounded-md px-1.5 py-0.5 font-mono text-[9px] font-medium tracking-tight text-white shadow-sm ${toneBg[p.tone]}`}
          >
            {p.code}
          </div>
          <div className="relative">
            {p.live && (
              <span
                className={`absolute inset-0 rounded-full ${toneBg[p.tone]} opacity-60 animate-pulse-ring`}
              />
            )}
            <span
              className={`relative block size-3 rounded-full ring-2 ring-white shadow ${toneBg[p.tone]}`}
            />
          </div>
        </div>
      ))}

      <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-full bg-white/85 px-3 py-1.5 backdrop-blur-md ring-1 ring-line">
        <span className="size-1.5 rounded-full bg-aegean-deep animate-pulse" />
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink">
          Live · Nicosia
        </span>
      </div>
      <div className="absolute bottom-3 right-3 rounded-full bg-white/85 backdrop-blur-md ring-1 ring-line px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
        24°C · Sun
      </div>
    </div>
  );
}

type Tone = "aegean" | "ochre" | "olive";

const tones: Record<Tone, string> = {
  aegean: "bg-aegean-soft/60 text-aegean-deep ring-aegean-deep/15",
  ochre: "bg-ochre-soft/60 text-ochre ring-ochre/20",
  olive: "bg-olive/10 text-olive ring-olive/15",
};

export function RouteChip({
  code,
  tone = "aegean",
  size = "md",
}: {
  code: string;
  tone?: Tone;
  size?: "sm" | "md";
}) {
  const sz = size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-xs";
  return (
    <span
      className={`inline-flex items-center justify-center rounded-md font-mono font-medium tracking-tight ring-1 ${tones[tone]} ${sz}`}
    >
      {code}
    </span>
  );
}

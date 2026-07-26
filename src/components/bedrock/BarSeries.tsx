import { barHeightPct, seriesMax } from "@aloya/core/bedrock-metering";

export interface BarPoint {
  key: string;
  value: number;
  title: string;
}

/**
 * Compact bar strip used by every metering chart. Handles the empty case and
 * keeps zero-value bars visible instead of collapsing them to nothing.
 */
export function BarSeries({
  points,
  color,
  heightClass = "h-24",
  emptyLabel = "No datapoints in window",
  gapClass = "gap-[2px]",
  minWidthClass = "min-w-[2px]",
}: {
  points: BarPoint[];
  color: string;
  heightClass?: string;
  emptyLabel?: string;
  gapClass?: string;
  minWidthClass?: string;
}) {
  const max = seriesMax(points.map((p) => p.value));
  return (
    <div className={`flex items-end ${gapClass} ${heightClass} border-b border-border pb-1`}>
      {points.map((p) => (
        <div
          key={p.key}
          title={p.title}
          className={`flex-1 ${minWidthClass} rounded-t`}
          style={{ height: `${barHeightPct(p.value, max)}%`, background: color }}
        />
      ))}
      {points.length === 0 && (
        <div className="w-full self-center text-center text-xs text-muted-foreground">
          {emptyLabel}
        </div>
      )}
    </div>
  );
}

export function AxisTicks({ labels }: { labels: string[] }) {
  if (labels.length < 2) return null;
  return (
    <div className="flex justify-between text-[10px] font-mono text-muted-foreground">
      {labels.map((l, i) => (
        <span key={`${l}-${i}`}>{l}</span>
      ))}
    </div>
  );
}

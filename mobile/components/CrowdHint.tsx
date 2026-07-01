// Mobile mirror of `src/components/CrowdHint.tsx`. Reads
// aggregated `route_load_estimates` (public-read RLS) directly via the
// mobile supabase client — no server function needed for a rider-facing
// read of already-aggregated crowd data.
//
// Renders nothing when we have no signal. Poll interval matches web (90s).

import { useMemo } from "react";
import { View, Text } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { palette } from "@/constants/theme";

export type CrowdLevel = "quiet" | "moderate" | "busy" | "packed";

type CrowdResult = { level: CrowdLevel | null; sample: number };

async function fetchCrowd(routeId: string, tripId?: string): Promise<CrowdResult> {
  const since = new Date(Date.now() - 30 * 60_000).toISOString();
  const { data } = await supabase
    .from("route_load_estimates")
    .select("load_index, rider_count, window_start, trip_id")
    .eq("route_id", routeId)
    .gte("window_start", since)
    .order("window_start", { ascending: false })
    .limit(8);
  if (!data || data.length === 0) return { level: null, sample: 0 };
  const tripRows = tripId ? data.filter((r) => r.trip_id === tripId) : [];
  const pick = tripRows.length ? tripRows : data;
  const avg =
    pick.reduce((s, r) => s + (r.load_index ?? 0), 0) / pick.length;
  let level: CrowdLevel = "quiet";
  if (avg >= 0.85) level = "packed";
  else if (avg >= 0.6) level = "busy";
  else if (avg >= 0.3) level = "moderate";
  return { level, sample: pick.length };
}

const COPY: Record<CrowdLevel, { line: string; tone: "olive" | "aegean" | "ochre" | "ochreStrong" }> = {
  quiet: { line: "Plenty of room. Comfortable ride.", tone: "olive" },
  moderate: { line: "A steady load. You'll find a seat.", tone: "aegean" },
  busy: { line: "Busy — standing likely.", tone: "ochre" },
  packed: { line: "Packed. Consider the next one.", tone: "ochreStrong" },
};

export function CrowdHint({ routeId, tripId }: { routeId: string; tripId?: string }) {
  const { data } = useQuery({
    queryKey: ["mobile-crowd", routeId, tripId ?? ""],
    queryFn: () => fetchCrowd(routeId, tripId),
    staleTime: 90_000,
    refetchInterval: 90_000,
  });

  const level = data?.level ?? null;
  const style = useMemo(() => {
    if (!level) return null;
    const c = COPY[level];
    switch (c.tone) {
      case "olive":
        return { bg: "rgba(63,74,54,0.10)", border: "rgba(63,74,54,0.25)", eye: palette.olive };
      case "aegean":
        return { bg: palette.aegeanSoft, border: "rgba(63,155,178,0.30)", eye: palette.aegeanDeep };
      case "ochre":
        return { bg: palette.ochreSoft, border: "rgba(201,133,58,0.35)", eye: palette.ochre };
      case "ochreStrong":
      default:
        return { bg: palette.ochreSoft, border: "rgba(201,133,58,0.55)", eye: palette.ochre };
    }
  }, [level]);

  if (!level || !style) return null;
  const c = COPY[level];
  return (
    <View style={{ paddingHorizontal: 20, marginTop: 12 }}>
      <View
        style={{
          borderRadius: 22,
          padding: 16,
          backgroundColor: style.bg,
          borderWidth: 1,
          borderColor: style.border,
        }}
      >
        <Text
          style={{
            fontFamily: "Geist_700Bold",
            fontSize: 10,
            letterSpacing: 2.2,
            color: style.eye,
            textTransform: "uppercase",
          }}
        >
          Comfort · from riders
        </Text>
        <Text
          style={{
            marginTop: 6,
            fontFamily: "Geist_600SemiBold",
            fontSize: 14,
            color: palette.ink,
            lineHeight: 20,
          }}
        >
          {c.line}
        </Text>
        {data && data.sample > 1 ? (
          <Text
            style={{
              marginTop: 4,
              fontFamily: "Geist_700Bold",
              fontSize: 10,
              letterSpacing: 1.6,
              color: palette.inkSoft,
              textTransform: "uppercase",
            }}
          >
            {data.sample} recent riders
          </Text>
        ) : null}
      </View>
    </View>
  );
}

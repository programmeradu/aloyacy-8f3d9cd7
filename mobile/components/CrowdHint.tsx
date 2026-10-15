// Mobile mirror of `src/components/CrowdHint.tsx`. Reads the aggregated
// `route_load_estimates` level from /api/public/route-load (same logic as
// the web getRouteLoad server function). No session needed.
//
// Renders nothing when we have no signal. Poll interval matches web (90s).

import { useMemo } from "react";
import { View, Text } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { fetchPublicApi } from "@/lib/api";
import { palette } from "@/constants/theme";

export type CrowdLevel = "quiet" | "moderate" | "busy" | "packed";

type CrowdResult = { level: CrowdLevel | null; sample: number };

async function fetchCrowd(routeId: string, tripId?: string): Promise<CrowdResult> {
  const qs = new URLSearchParams({ routeId });
  if (tripId) qs.set("tripId", tripId);
  try {
    const res = await fetchPublicApi(`/api/public/route-load?${qs}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return { level: null, sample: 0 };
    const body = (await res.json()) as { level?: CrowdLevel | null; sample?: number };
    return { level: body.level ?? null, sample: body.sample ?? 0 };
  } catch {
    return { level: null, sample: 0 };
  }
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

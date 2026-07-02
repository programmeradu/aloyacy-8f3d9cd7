// Native group map — real map with member dots + destination pin, camera
// auto-frames the whole group. Uses react-native-maps (Google on Android,
// Apple on iOS via PROVIDER_DEFAULT).
import { useEffect, useRef } from "react";
import { View, Text } from "react-native";
import MapView, { Marker, Callout } from "react-native-maps";
import { palette } from "@/constants/theme";

const MEMBER_TONES = [palette.aegeanDeep, palette.ochre, palette.olive, palette.ink] as const;
const STALE_MS = 75_000;

export type GroupMapMember = {
  id: string;
  displayName: string;
  lat: number | null;
  lng: number | null;
  lastUpdated: string | null;
  isMe: boolean;
  isCreator: boolean;
};

export function GroupMap({
  members,
  destination,
  destinationLabel,
  height = 260,
}: {
  members: GroupMapMember[];
  destination: { lat: number; lng: number };
  destinationLabel: string;
  height?: number;
}) {
  const ref = useRef<MapView | null>(null);
  const pts = members.filter((m) => m.lat != null && m.lng != null);
  const coords = [
    { latitude: destination.lat, longitude: destination.lng },
    ...pts.map((m) => ({ latitude: m.lat as number, longitude: m.lng as number })),
  ];

  useEffect(() => {
    if (!ref.current || coords.length === 0) return;
    const t = setTimeout(() => {
      ref.current?.fitToCoordinates(coords, {
        edgePadding: { top: 60, right: 60, bottom: 60, left: 60 },
        animated: true,
      });
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(coords)]);

  const now = Date.now();

  return (
    <View
      style={{
        height,
        borderRadius: 20,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: palette.line,
        backgroundColor: palette.limestoneSoft,
      }}
    >
      <MapView
        ref={ref}
        style={{ flex: 1 }}
        initialRegion={{
          latitude: destination.lat,
          longitude: destination.lng,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
        showsCompass={false}
        showsMyLocationButton={false}
        toolbarEnabled={false}
      >
        <Marker
          coordinate={{ latitude: destination.lat, longitude: destination.lng }}
          anchor={{ x: 0.5, y: 0.5 }}
        >
          <View
            style={{
              width: 22,
              height: 22,
              borderRadius: 999,
              backgroundColor: palette.ink,
              borderWidth: 3,
              borderColor: palette.limestone,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <View style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: palette.ochre }} />
          </View>
          <Callout>
            <Text style={{ fontWeight: "600" }}>{destinationLabel}</Text>
          </Callout>
        </Marker>
        {pts.map((m, i) => {
          const tone = MEMBER_TONES[i % MEMBER_TONES.length];
          const stale = m.lastUpdated
            ? now - new Date(m.lastUpdated).getTime() > STALE_MS
            : true;
          return (
            <Marker
              key={m.id}
              coordinate={{ latitude: m.lat as number, longitude: m.lng as number }}
              anchor={{ x: 0.5, y: 0.5 }}
              opacity={stale ? 0.55 : 1}
            >
              <View
                style={{
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  borderRadius: 999,
                  backgroundColor: stale ? "#9a9689" : tone,
                  borderWidth: 2,
                  borderColor: palette.limestone,
                }}
              >
                <Text
                  style={{
                    color: palette.white,
                    fontSize: 11,
                    fontFamily: "Geist_700Bold",
                  }}
                >
                  {m.displayName.split(/\s+/)[0]?.slice(0, 10) ?? "•"}
                  {m.isMe ? " (you)" : ""}
                </Text>
              </View>
            </Marker>
          );
        })}
      </MapView>
    </View>
  );
}

export default GroupMap;

import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, Dimensions } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Magnetometer } from "expo-sensors";
import * as Location from "expo-location";
import { router, useLocalSearchParams } from "expo-router";
import { palette } from "@/constants/theme";
import { X, Navigation } from "lucide-react-native";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

/** Great-circle distance in metres. */
function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Initial bearing from a to b, in degrees clockwise from true north. */
function bearingDegrees(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/**
 * Native AR Viewfinder.
 *
 * Overlays a virtual bus stop marker on the real world using the camera,
 * magnetometer, and GPS. Essential for finding stops in dense or
 * unfamiliar areas where 2D maps are confusing.
 */
export default function ArGuideScreen() {
  const { lat, lng, label } = useLocalSearchParams<{ lat: string; lng: string; label: string }>();
  const targetLat = parseFloat(lat ?? "0");
  const targetLng = parseFloat(lng ?? "0");

  const hasTarget =
    Number.isFinite(targetLat) &&
    Number.isFinite(targetLng) &&
    !(targetLat === 0 && targetLng === 0);

  const [permission, requestPermission] = useCameraPermissions();
  const [heading, setHeading] = useState(0);
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [locError, setLocError] = useState<string | null>(null);

  useEffect(() => {
    if (!permission?.granted) void requestPermission();
  }, [permission?.granted, requestPermission]);

  // Compass. Prefer the OS-fused (true north) heading; fall back to the raw
  // magnetometer when the platform can't provide one.
  useEffect(() => {
    let headingSub: Location.LocationSubscription | null = null;
    let magSub: { remove: () => void } | null = null;
    let cancelled = false;

    (async () => {
      try {
        headingSub = await Location.watchHeadingAsync((h) => {
          if (cancelled) return;
          const deg = h.trueHeading >= 0 ? h.trueHeading : h.magHeading;
          if (Number.isFinite(deg) && deg >= 0) setHeading((deg + 360) % 360);
        });
      } catch {
        Magnetometer.setUpdateInterval(100);
        magSub = Magnetometer.addListener((data) => {
          if (cancelled) return;
          let angle = Math.atan2(data.y, data.x) * (180 / Math.PI);
          angle = angle < 0 ? angle + 360 : angle;
          setHeading(angle);
        });
      }
    })();

    return () => {
      cancelled = true;
      headingSub?.remove();
      magSub?.remove();
    };
  }, []);

  // Rider position — this is what makes the marker point at the real stop.
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (status !== "granted") {
        setLocError("Location permission is required to aim at the stop.");
        return;
      }
      setLocError(null);
      try {
        sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, timeInterval: 1000, distanceInterval: 2 },
          (pos) => {
            if (cancelled) return;
            setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          },
        );
      } catch {
        if (!cancelled) setLocError("Couldn't read your location.");
      }
    })();

    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, []);

  const target = { lat: targetLat, lng: targetLng };
  const bearing = userLoc && hasTarget ? bearingDegrees(userLoc, target) : null;
  const distance = userLoc && hasTarget ? distanceMeters(userLoc, target) : null;

  // Relative position of the marker on screen (90° field of view).
  const relativeBearing = bearing === null ? null : ((bearing - heading + 540) % 360) - 180;
  const isVisible = relativeBearing !== null && Math.abs(relativeBearing) < 45;
  const screenX =
    relativeBearing === null
      ? SCREEN_W / 2
      : Math.min(
          SCREEN_W - 20,
          Math.max(20, SCREEN_W / 2 + (relativeBearing / 45) * (SCREEN_W / 2)),
        );
  const arrived = distance !== null && distance < 15;

  return (
    <View style={styles.container}>
      {!permission?.granted ? (
        <View style={styles.center}>
          <Text style={styles.msg}>Camera permission required for AR</Text>
          <Pressable style={styles.btn} onPress={requestPermission}>
            <Text style={styles.btnText}>Grant Permission</Text>
          </Pressable>
        </View>
      ) : (
        <CameraView style={StyleSheet.absoluteFill} facing="back">
          <View style={styles.overlay}>
            {/* Header */}
            <View style={styles.header}>
              <Pressable onPress={() => router.back()} style={styles.closeBtn}>
                <X color={palette.white} size={24} />
              </Pressable>
              <View>
                <Text style={styles.title}>{label || "Target Stop"}</Text>
                <Text style={styles.subtitle}>AR Guide Active</Text>
              </View>
            </View>

            {/* The AR Marker */}
            {isVisible && (
              <View style={[styles.marker, { left: screenX - 60 }]}>
                <View style={styles.markerInner}>
                  <Navigation color={palette.white} size={32} />
                </View>
                <View style={styles.markerTag}>
                  <Text style={styles.markerText}>{label}</Text>
                </View>
              </View>
            )}

            {/* Guidance Arrows */}
            {!isVisible && (
              <View style={styles.guidance}>
                <Navigation
                  color={palette.ochre}
                  size={48}
                  style={{
                    transform: [{ rotate: `${relativeBearing > 0 ? 90 : -90}deg` }],
                  }}
                />
                <Text style={styles.guidanceText}>
                  Turn {relativeBearing > 0 ? "Right" : "Left"}
                </Text>
              </View>
            )}

            {/* Footer Stats */}
            <View style={styles.footer}>
              <View style={styles.stat}>
                <Text style={styles.statVal}>{Math.round(distance)}m</Text>
                <Text style={styles.statLab}>DISTANCE</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statVal}>{Math.round(heading)}°</Text>
                <Text style={styles.statLab}>HEADING</Text>
              </View>
            </View>
          </View>
        </CameraView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  msg: { color: palette.white, fontSize: 16, textAlign: "center", marginBottom: 20 },
  btn: { backgroundColor: palette.aegean, padding: 16, borderRadius: 12 },
  btnText: { color: palette.white, fontWeight: "bold" },
  overlay: { flex: 1, paddingTop: 60, paddingBottom: 40 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    gap: 16,
  },
  closeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { color: palette.white, fontSize: 20, fontWeight: "bold" },
  subtitle: { color: "rgba(255,255,255,0.7)", fontSize: 12, letterSpacing: 1 },
  marker: {
    position: "absolute",
    top: SCREEN_H / 2 - 50,
    width: 120,
    alignItems: "center",
  },
  markerInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: palette.aegeanDeep,
    borderWidth: 3,
    borderColor: palette.white,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 10,
  },
  markerTag: {
    marginTop: 8,
    backgroundColor: palette.white,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  markerText: { color: palette.ink, fontSize: 12, fontWeight: "bold" },
  guidance: {
    position: "absolute",
    top: SCREEN_H / 2 - 100,
    alignSelf: "center",
    alignItems: "center",
    gap: 10,
  },
  guidanceText: { color: palette.white, fontSize: 18, fontWeight: "bold", textShadowColor: "#000", textShadowRadius: 4 },
  footer: {
    position: "absolute",
    bottom: 40,
    left: 20,
    right: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "rgba(0,0,0,0.6)",
    padding: 20,
    borderRadius: 20,
  },
  stat: { alignItems: "center" },
  statVal: { color: palette.white, fontSize: 24, fontWeight: "bold" },
  statLab: { color: "rgba(255,255,255,0.5)", fontSize: 10, letterSpacing: 1 },
});

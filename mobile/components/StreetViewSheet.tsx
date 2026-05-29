// Native mirror of `src/components/StreetViewSheet.tsx`. Fetches the
// server-proxied Mapillary JPEG (never exposes the access token) and
// displays it fullscreen with a close chrome + caption. Falls back to a
// styled "no coverage" state on 404.

import { useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  Image,
  Pressable,
  ActivityIndicator,
  StatusBar,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { palette } from "@/constants/theme";
import { API_BASE } from "@/lib/api";

export function StreetViewSheet({
  open,
  onClose,
  lat,
  lng,
  heading,
  label,
}: {
  open: boolean;
  onClose: () => void;
  lat: number;
  lng: number;
  heading?: number;
  label?: string;
}) {
  const insets = useSafeAreaInsets();
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSrc(null);
    setError(null);
    setLoading(true);
    const q = new URLSearchParams({ lat: String(lat), lng: String(lng) });
    if (heading != null) q.set("heading", String(heading));
    const url = `${API_BASE}/api/public/streetview?${q.toString()}`;
    let cancelled = false;
    fetch(url, { method: "GET" })
      .then((r) => {
        if (cancelled) return;
        if (!r.ok) {
          setError(r.status === 404 ? "No imagery" : `Error ${r.status}`);
          setLoading(false);
          return;
        }
        setSrc(url);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, lat, lng, heading]);

  const handleClose = () => {
    Haptics.selectionAsync().catch(() => {});
    onClose();
  };

  return (
    <Modal
      visible={open}
      animationType="fade"
      transparent={false}
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <StatusBar barStyle="light-content" />
      <View style={{ flex: 1, backgroundColor: palette.ink }}>
        {src && !error ? (
          <Image
            source={{ uri: src }}
            style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
            resizeMode="cover"
          />
        ) : null}

        {loading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={palette.limestone} />
            <Text
              style={{
                marginTop: 12,
                fontFamily: "Geist_700Bold",
                fontSize: 10,
                letterSpacing: 2.2,
                textTransform: "uppercase",
                color: "rgba(240,235,225,0.7)",
              }}
            >
              Loading street view
            </Text>
          </View>
        ) : null}

        {error ? (
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 32,
            }}
          >
            <Text
              style={{
                fontFamily: "Geist_700Bold",
                fontSize: 10,
                letterSpacing: 2.2,
                textTransform: "uppercase",
                color: palette.ochre,
              }}
            >
              No coverage
            </Text>
            <Text
              style={{
                marginTop: 8,
                fontFamily: "BricolageGrotesque_700Bold",
                fontSize: 20,
                textAlign: "center",
                color: palette.limestone,
              }}
            >
              No street imagery exists for this point.
            </Text>
          </View>
        ) : null}

        <Pressable
          onPress={handleClose}
          hitSlop={12}
          style={({ pressed }) => ({
            position: "absolute",
            left: 16,
            top: Math.max(insets.top, 16),
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingHorizontal: 14,
            paddingVertical: 9,
            borderRadius: 999,
            backgroundColor: "rgba(240,235,225,0.92)",
            opacity: pressed ? 0.75 : 1,
          })}
          accessibilityLabel="Close street view"
        >
          <Text style={{ fontFamily: "Geist_700Bold", fontSize: 14, color: palette.ink }}>
            ←
          </Text>
          <Text
            style={{
              fontFamily: "Geist_700Bold",
              fontSize: 10,
              letterSpacing: 1.8,
              textTransform: "uppercase",
              color: palette.ink,
            }}
          >
            Close
          </Text>
        </Pressable>

        {label ? (
          <View
            style={{
              position: "absolute",
              left: 20,
              right: 20,
              bottom: Math.max(insets.bottom, 20),
            }}
            pointerEvents="none"
          >
            <View
              style={{
                alignSelf: "center",
                maxWidth: 420,
                borderRadius: 20,
                backgroundColor: "rgba(31,32,35,0.72)",
                paddingHorizontal: 16,
                paddingVertical: 12,
                borderWidth: 1,
                borderColor: "rgba(240,235,225,0.12)",
              }}
            >
              <Text
                style={{
                  fontFamily: "Geist_700Bold",
                  fontSize: 10,
                  letterSpacing: 2.2,
                  textTransform: "uppercase",
                  color: "rgba(240,235,225,0.6)",
                  textAlign: "center",
                }}
              >
                Street view
              </Text>
              <Text
                style={{
                  marginTop: 2,
                  fontFamily: "BricolageGrotesque_700Bold",
                  fontSize: 16,
                  color: palette.limestone,
                  textAlign: "center",
                }}
              >
                {label}
              </Text>
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

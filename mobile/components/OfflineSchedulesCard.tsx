import { useEffect, useState } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { palette } from "@/constants/theme";
import { Card } from "./Card";
import {
  type DownloadProgress,
  type OfflineStatus,
  clearOfflineSchedules,
  downloadOfflineSchedules,
  formatBytes,
  getOfflineStatus,
} from "@/lib/offline";

/**
 * Editorial offline-cache control. Lets riders mirror the next 7 days of
 * timetables so the app works on the Troodos passes, in airport basements,
 * or when their mobile contract runs dry.
 */
export function OfflineSchedulesCard() {
  const [status, setStatus] = useState<OfflineStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getOfflineStatus().then(setStatus);
  }, []);

  async function onDownload() {
    setBusy(true);
    setError(null);
    setProgress({ total: 1, done: 0, currentLabel: "Starting…" });
    try {
      const next = await downloadOfflineSchedules({
        daysAhead: 7,
        onProgress: setProgress,
      });
      setStatus(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function onClear() {
    setBusy(true);
    try {
      await clearOfflineSchedules();
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }

  const has = status && status.dates.length > 0;
  const pct = progress ? Math.round((progress.done / Math.max(1, progress.total)) * 100) : 0;

  return (
    <Card style={{ padding: 18, marginTop: 16 }}>
      <Text
        style={{
          fontFamily: "BricolageGrotesque_700Bold",
          fontSize: 18,
          color: palette.ink,
          letterSpacing: -0.4,
        }}
      >
        Offline timetables
      </Text>
      <Text
        style={{
          marginTop: 6,
          fontFamily: "Geist_500Medium",
          fontSize: 13,
          lineHeight: 19,
          color: palette.inkSoft,
        }}
      >
        Mirror the next 7 days of schedules so trips, stops, and routes keep
        working with no signal. Stays current automatically when you tap refresh.
      </Text>

      <View
        style={{
          marginTop: 14,
          paddingTop: 14,
          borderTopWidth: 1,
          borderTopColor: palette.line,
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
        <View style={{ flex: 1 }}>
          {has ? (
            <>
              <Text
                style={{
                  fontFamily: "JetBrainsMono_500Medium",
                  fontSize: 12,
                  color: palette.ink,
                  letterSpacing: 0.3,
                }}
              >
                {status!.dates.length} DAYS · {formatBytes(status!.bytes)}
              </Text>
              <Text
                style={{
                  marginTop: 4,
                  fontFamily: "Geist_500Medium",
                  fontSize: 12,
                  color: palette.inkSoft,
                }}
              >
                Updated {timeAgo(status!.lastUpdatedAt)}
              </Text>
            </>
          ) : (
            <Text
              style={{
                fontFamily: "Geist_500Medium",
                fontSize: 13,
                color: palette.inkSoft,
              }}
            >
              Not downloaded yet
            </Text>
          )}
        </View>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={onDownload}
          style={({ pressed }) => ({
            backgroundColor: palette.aegean,
            paddingHorizontal: 18,
            paddingVertical: 12,
            borderRadius: 14,
            opacity: pressed || busy ? 0.8 : 1,
            minWidth: 120,
            alignItems: "center",
          })}
        >
          {busy ? (
            <ActivityIndicator color={palette.white} />
          ) : (
            <Text
              style={{
                fontFamily: "Geist_700Bold",
                fontSize: 13,
                color: palette.white,
                letterSpacing: 0.2,
              }}
            >
              {has ? "Refresh" : "Download"}
            </Text>
          )}
        </Pressable>
      </View>

      {progress && (
        <View style={{ marginTop: 14 }}>
          <View
            style={{
              height: 6,
              borderRadius: 3,
              backgroundColor: palette.line,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                height: "100%",
                width: `${pct}%`,
                backgroundColor: palette.aegean,
              }}
            />
          </View>
          <Text
            style={{
              marginTop: 8,
              fontFamily: "JetBrainsMono_500Medium",
              fontSize: 11,
              color: palette.inkSoft,
              letterSpacing: 0.3,
            }}
            numberOfLines={1}
          >
            {pct}% · {progress.currentLabel}
          </Text>
        </View>
      )}

      {error && (
        <Text
          style={{
            marginTop: 12,
            fontFamily: "Geist_500Medium",
            fontSize: 12,
            color: palette.ochre,
          }}
        >
          {error}
        </Text>
      )}

      {has && !busy && (
        <Pressable onPress={onClear} style={{ marginTop: 14 }}>
          <Text
            style={{
              fontFamily: "Geist_600SemiBold",
              fontSize: 12,
              color: palette.inkSoft,
              textDecorationLine: "underline",
            }}
          >
            Clear cached schedules
          </Text>
        </Pressable>
      )}
    </Card>
  );
}

function timeAgo(unixMs: number): string {
  const s = Math.max(0, Math.round((Date.now() - unixMs) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

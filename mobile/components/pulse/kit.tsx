// Shared Pulse primitives — eyebrow labels, signal card shell, stat figures,
// error/footer states and date formatting. Extracted from the Pulse screen so
// each card group lives in its own file under the 500-LOC ceiling.

import { useMemo } from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import { palette } from "@/constants/theme";

export const DISPLAY = "BricolageGrotesque_700Bold";
export const DISPLAY_MED = "BricolageGrotesque_700Bold";
export const SANS = "Geist_700Bold";
export const SANS_BOLD = "Geist_700Bold";
export const MONO = "Geist_700Bold";
export const EYEBROW = "Geist_700Bold";

export function SignalCard({
  tone,
  kicker,
  children,
  image,
  imageTone: _imageTone = "light",
}: {
  tone: string;
  kicker: string;
  children: React.ReactNode;
  image?: { uri: string };
  imageTone?: "light" | "dark";
}) {
  return (
    <View
      style={{
        borderRadius: 22,
        backgroundColor: palette.white,
        borderWidth: 1,
        borderColor: palette.line,
        overflow: "hidden",
      }}
    >
      {image && (
        <View
          style={{
            position: "relative",
            width: "100%",
            aspectRatio: 16 / 8,
            backgroundColor: palette.limestoneSoft,
          }}
        >
          <Image source={image} resizeMode="cover" style={StyleSheet.absoluteFill} />
          {/* Kicker chip floats on the image — image itself remains fully visible. */}
          <View
            style={{
              position: "absolute",
              left: 14,
              top: 14,
              backgroundColor: "rgba(255,255,255,0.94)",
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: palette.line,
            }}
          >
            <Text
              style={{
                fontFamily: EYEBROW,
                fontSize: 9,
                letterSpacing: 1.8,
                color: tone,
                textTransform: "uppercase",
              }}
            >
              {kicker}
            </Text>
          </View>
        </View>
      )}
      <View style={{ position: "relative", padding: 20, paddingLeft: 22 }}>
        <View
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 3,
            backgroundColor: tone,
            opacity: 0.85,
          }}
        />
        {!image && (
          <Text
            style={{
              fontFamily: EYEBROW,
              fontSize: 9.5,
              letterSpacing: 2,
              color: tone,
              textTransform: "uppercase",
            }}
          >
            {kicker}
          </Text>
        )}
        <View style={{ marginTop: image ? 0 : 8 }}>{children}</View>
      </View>
    </View>
  );
}

export function StatFigure({
  value,
  unit,
  label,
  small,
}: {
  value: string;
  unit: string;
  label: string;
  small?: boolean;
}) {
  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 3 }}>
        <Text
          style={{
            fontFamily: DISPLAY,
            fontSize: small ? 22 : 30,
            color: palette.ink,
            letterSpacing: -0.4,
          }}
        >
          {value}
        </Text>
        {unit ? (
          <Text
            style={{
              fontFamily: EYEBROW,
              fontSize: 10,
              letterSpacing: 1.6,
              color: palette.inkSoft,
              textTransform: "uppercase",
            }}
          >
            {unit}
          </Text>
        ) : null}
      </View>
      <Text
        style={{
          marginTop: 2,
          fontFamily: EYEBROW,
          fontSize: 9,
          letterSpacing: 1.6,
          color: palette.inkSoft,
          textTransform: "uppercase",
        }}
      >
        {label}
      </Text>
    </View>
  );
}

export function Eyebrow({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: "aegean" | "ochre" | "olive";
}) {
  const color =
    tone === "aegean"
      ? palette.aegeanDeep
      : tone === "ochre"
      ? palette.ochre
      : tone === "olive"
      ? palette.olive
      : palette.inkSoft;
  return (
    <Text
      style={{
        fontFamily: EYEBROW,
        fontSize: 10,
        letterSpacing: 2.2,
        color,
        textTransform: "uppercase",
      }}
    >
      {children}
    </Text>
  );
}

export function ErrorCard({ message }: { message: string }) {
  return (
    <View
      style={{
        borderRadius: 20,
        padding: 18,
        backgroundColor: palette.white,
        borderWidth: 1,
        borderColor: palette.line,
      }}
    >
      <Text
        style={{
          fontFamily: EYEBROW,
          fontSize: 10,
          letterSpacing: 2,
          color: palette.ochre,
          textTransform: "uppercase",
        }}
      >
        Feed offline
      </Text>
      <Text style={{ marginTop: 6, fontFamily: SANS, fontSize: 13.5, color: palette.ink }}>
        {message}
      </Text>
    </View>
  );
}

export function UpdatedFooter({ generatedAt }: { generatedAt: number }) {
  const label = useMemo(() => {
    const d = new Date(generatedAt * 1000);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `Updated ${hh}:${mm}`;
  }, [generatedAt]);
  return (
    <View style={{ marginTop: 28, alignItems: "center" }}>
      <Text
        style={{
          fontFamily: EYEBROW,
          fontSize: 9.5,
          letterSpacing: 2,
          color: palette.inkSoft,
          textTransform: "uppercase",
        }}
      >
        {label}
      </Text>
    </View>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/* Utils                                                                    */
/* ─────────────────────────────────────────────────────────────────────── */

export function relativeAgo(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function formatShortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

export function formatKickoff(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

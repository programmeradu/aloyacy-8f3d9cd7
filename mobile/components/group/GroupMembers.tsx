// Converge summary card and the per-member list with live ETA + freshness.

import { Share, Text, View } from "react-native";
import { palette } from "@/constants/theme";
import { MEMBER_TONES, formatEta, initials, isStale, timeAgo, type MemberRow } from "./kit";

export function ConvergeCard({ members, expired }: { members: MemberRow[]; expired: boolean }) {
  const active = members.filter((m) => m.status === "active" && m.eta_minutes != null);
  const etas = active
    .map((m) => m.eta_minutes)
    .filter((n): n is number => n != null)
    .sort((a, b) => a - b);
  const min = etas[0];
  const max = etas[etas.length - 1];

  let headline = "Waiting for everyone's ETA";
  let sub = "As people join and share location, arrivals appear here.";
  if (expired) {
    headline = "Trip ended";
    sub = "Everyone who joined is listed below.";
  } else if (etas.length >= 2 && min != null && max != null) {
    const spread = max - min;
    if (spread <= 2) {
      headline = `Everyone in ~${Math.round(max)} min`;
      sub = "You'll all arrive within a couple of minutes of each other.";
    } else {
      headline = `First in ${Math.round(min)} · last in ${Math.round(max)}`;
      sub = `A ${Math.round(spread)}-minute spread. Slowest sets the meeting time.`;
    }
  } else if (etas.length === 1 && min != null) {
    headline = `Arriving in ${Math.round(min)} min`;
    sub = "You're the only one sharing location right now.";
  }

  return (
    <View
      style={{
        backgroundColor: palette.aegeanSoft,
        borderRadius: 24,
        padding: 20,
        borderWidth: 1,
        borderColor: "rgba(31,108,130,0.15)",
      }}
    >
      <Text
        style={{
          fontFamily: "JetBrainsMono_500Medium",
          fontSize: 10,
          letterSpacing: 2.2,
          textTransform: "uppercase",
          color: palette.aegeanDeep,
        }}
      >
        Meet time
      </Text>
      <Text
        style={{
          marginTop: 8,
          fontFamily: "BricolageGrotesque_800ExtraBold",
          fontSize: 26,
          lineHeight: 30,
          letterSpacing: -0.6,
          color: palette.ink,
        }}
      >
        {headline}
      </Text>
      <Text style={{ marginTop: 8, fontFamily: "Geist_500Medium", fontSize: 13, lineHeight: 19, color: palette.inkSoft }}>
        {sub}
      </Text>
    </View>
  );
}

/* ——————————————————————————— Members list ——————————————————————————— */

export function MembersList({ members, meId }: { members: MemberRow[]; meId: string | null }) {
  if (members.length === 0) {
    return (
      <View
        style={{
          backgroundColor: palette.white,
          borderRadius: 20,
          borderWidth: 1,
          borderColor: palette.line,
          padding: 20,
        }}
      >
        <Text style={{ fontFamily: "Geist_500Medium", fontSize: 13, color: palette.inkSoft }}>
          No one has joined yet. Share the code to invite people.
        </Text>
      </View>
    );
  }
  return (
    <View
      style={{
        backgroundColor: palette.white,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: palette.line,
        overflow: "hidden",
      }}
    >
      <View style={{ padding: 16, borderBottomWidth: 1, borderColor: palette.line }}>
        <Text
          style={{
            fontFamily: "JetBrainsMono_500Medium",
            fontSize: 10,
            letterSpacing: 2.2,
            textTransform: "uppercase",
            color: palette.inkSoft,
          }}
        >
          On the way
        </Text>
      </View>
      {members.map((m, i) => {
        const tone = MEMBER_TONES[i % MEMBER_TONES.length];
        const isMe = m.id === meId;
        const stale = m.status === "active" && m.last_lat != null && isStale(m.last_updated);
        return (
          <View
            key={m.id}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 14,
              padding: 16,
              borderTopWidth: i === 0 ? 0 : 1,
              borderColor: palette.line,
              backgroundColor: isMe ? "rgba(215,232,236,0.35)" : "transparent",
            }}
          >
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 999,
                backgroundColor: stale ? "#9a9689" : tone,
                alignItems: "center",
                justifyContent: "center",
                opacity: stale ? 0.7 : 1,
              }}
            >
              <Text style={{ fontFamily: "Geist_700Bold", fontSize: 13, color: palette.white }}>
                {initials(m.display_name)}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: "Geist_700Bold", fontSize: 15, color: palette.ink }} numberOfLines={1}>
                {m.display_name}
                {isMe ? "  — you" : ""}
                {m.is_creator ? "  · host" : ""}
              </Text>
              <Text
                style={{
                  marginTop: 2,
                  fontFamily: "Geist_500Medium",
                  fontSize: 12,
                  color: stale ? palette.ochre : palette.inkSoft,
                }}
              >
                {m.status === "left"
                  ? "Left the group"
                  : m.last_lat == null
                    ? "Waiting for location"
                    : stale
                      ? `Signal lost · last seen ${timeAgo(m.last_updated)}`
                      : `Updated ${timeAgo(m.last_updated)}`}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={{ fontFamily: "BricolageGrotesque_700Bold", fontSize: 18, color: palette.ink }}>
                {m.status === "left" ? "—" : formatEta(m.eta_minutes)}
              </Text>
              <Text
                style={{
                  marginTop: 2,
                  fontFamily: "JetBrainsMono_500Medium",
                  fontSize: 9,
                  letterSpacing: 1.6,
                  textTransform: "uppercase",
                  color: palette.inkSoft,
                }}
              >
                ETA
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

/* ——————————————————————————— Join card ——————————————————————————— */

// Native live journey HUD — parity with `src/components/JourneyHUD.tsx`.
// Renders only the card relevant to the current live phase:
//
//   idle              → Start card (large "Start live guidance" CTA)
//   walking-to-stop   → Live step card (current instruction + countdowns)
//   hurry-soft/urgent → Hurry banner above the step card
//   at-stop           → Bus-in-N-min waiting card
//   boarding          → Confirm-boarding card with 30 s auto-confirm
//   missed-bus        → Rescue card (Find another bus / End trip)
//   on-bus            → Riding card (fused ETA, calm/lost note)
//   alight-soon       → Riding card + prominent "I'm off" button
//   arrived           → Arrived card
//
// Actions call `startLiveTracking / confirmOnBoard / markMissed /
// markAlighted` — identical vocabulary to web so the phase machine
// behaves the same.

import { useEffect, useState } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { palette } from "@/constants/theme";
import {
  startLiveTracking,
  confirmOnBoard,
  markMissed,
  markAlighted,
  type LiveJourney,
} from "@/lib/useJourney";
import {
  clearActiveTrip,
  setActiveTrip,
  type ActiveTrip,
} from "@/lib/trip-store";
import { fetchPlan } from "@/lib/plan";
import type { WalkStep } from "@aloya/core/geo";

const KICKER = {
  fontFamily: "JetBrainsMono_500Medium" as const,
  fontSize: 10,
  letterSpacing: 2.2,
  textTransform: "uppercase" as const,
};

function fmtMin(sec: number): string {
  const m = Math.max(0, Math.round(sec / 60));
  if (m < 1) return "under a minute";
  if (m === 1) return "1 min";
  return `${m} min`;
}

function fmtDist(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.round(m)} m`;
}

export function JourneyHUD({
  trip,
  live,
  steps,
}: {
  trip: ActiveTrip;
  live: LiveJourney;
  steps: WalkStep[] | null;
}) {
  if (!live.active) return <StartCard trip={trip} />;

  return (
    <View style={{ gap: 14 }}>
      {(live.phase === "hurry-soft" || live.phase === "hurry-urgent") && (
        <HurryBanner urgent={live.phase === "hurry-urgent"} live={live} />
      )}

      {(live.phase === "walking-to-stop" ||
        live.phase === "hurry-soft" ||
        live.phase === "hurry-urgent" ||
        live.phase === "walking-to-dest") &&
        steps &&
        steps.length > 0 && <LiveStepCard live={live} steps={steps} />}

      {live.phase === "at-stop" && <AtStopCard trip={trip} live={live} />}
      {live.phase === "boarding" && <BoardingPrompt trip={trip} live={live} />}
      {live.phase === "missed-bus" && <MissedBusCard trip={trip} />}
      {(live.phase === "on-bus" || live.phase === "alight-soon") && (
        <RidingCard trip={trip} live={live} />
      )}
      {live.phase === "arrived" && <ArrivedCard trip={trip} />}
    </View>
  );
}

// ---------- Start ----------

function StartCard({ trip }: { trip: ActiveTrip }) {
  return (
    <View style={{ paddingHorizontal: 20 }}>
      <View
        style={{
          borderRadius: 28,
          backgroundColor: palette.ink,
          padding: 22,
        }}
      >
        <Text style={{ ...KICKER, color: palette.limestone }}>Live guidance</Text>
        <Text
          style={{
            marginTop: 10,
            fontFamily: "BricolageGrotesque_800ExtraBold",
            fontSize: 30,
            lineHeight: 34,
            letterSpacing: -0.7,
            color: palette.white,
          }}
        >
          Ready to head to {trip.to.label}?
        </Text>
        <Text
          style={{
            marginTop: 8,
            fontFamily: "Geist_500Medium",
            fontSize: 13,
            lineHeight: 20,
            color: "rgba(246,241,231,0.75)",
          }}
        >
          We'll track your walk, warn you if the bus slips, and press-stop for
          you before you need to. Lock the screen — we'll buzz when it matters.
        </Text>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            startLiveTracking();
          }}
          style={({ pressed }) => ({
            marginTop: 18,
            alignSelf: "flex-start",
            backgroundColor: palette.limestone,
            paddingHorizontal: 22,
            paddingVertical: 14,
            borderRadius: 999,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Text
            style={{
              fontFamily: "Geist_700Bold",
              fontSize: 14,
              color: palette.ink,
              letterSpacing: -0.2,
            }}
          >
            Start live guidance
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// ---------- Hurry ----------

function HurryBanner({ urgent, live }: { urgent: boolean; live: LiveJourney }) {
  return (
    <View style={{ paddingHorizontal: 20 }}>
      <View
        style={{
          borderRadius: 24,
          padding: 18,
          backgroundColor: urgent ? palette.ochreSoft : "rgba(242,223,196,0.55)",
          borderWidth: 1,
          borderColor: urgent ? "rgba(201,133,58,0.5)" : "rgba(201,133,58,0.25)",
        }}
      >
        <Text style={{ ...KICKER, color: palette.ochre }}>
          {urgent ? "Hurry — bus is here" : "Pace up"}
        </Text>
        <Text
          style={{
            marginTop: 6,
            fontFamily: "BricolageGrotesque_800ExtraBold",
            fontSize: 26,
            lineHeight: 30,
            letterSpacing: -0.6,
            color: palette.ink,
          }}
        >
          Bus in {fmtMin(live.secsToBoard)} · walk {fmtMin(live.walkingEtaSec)}
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
          {urgent
            ? "Wave it down as you approach — the driver can still see you."
            : "Pick up the pace slightly and you'll make the stop in time."}
        </Text>
      </View>
    </View>
  );
}

// ---------- Live walking step ----------

function LiveStepCard({ live, steps }: { live: LiveJourney; steps: WalkStep[] }) {
  const idx = Math.min(live.currentStepIndex, steps.length - 1);
  const step = steps[idx];
  const next = steps[idx + 1];
  const isFinal = idx === steps.length - 1;
  return (
    <View style={{ paddingHorizontal: 20 }}>
      <View
        style={{
          borderRadius: 28,
          padding: 22,
          backgroundColor: palette.white,
          borderWidth: 1,
          borderColor: palette.line,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Text style={{ ...KICKER, color: palette.aegeanDeep }}>
            {live.phase === "walking-to-dest"
              ? "Walking to destination"
              : "Walking to stop"}
          </Text>
          <Text style={{ ...KICKER, color: palette.inkSoft, letterSpacing: 1.6 }}>
            {fmtDist(live.metersToDestination)} · {fmtMin(live.walkingEtaSec)}
          </Text>
        </View>
        <Text
          style={{
            marginTop: 12,
            fontFamily: "BricolageGrotesque_800ExtraBold",
            fontSize: 30,
            lineHeight: 34,
            letterSpacing: -0.7,
            color: palette.ink,
          }}
        >
          {step.instruction}
        </Text>
        <Text
          style={{
            marginTop: 8,
            ...KICKER,
            color: palette.inkSoft,
            letterSpacing: 1.6,
          }}
        >
          {fmtDist(live.metersToStepEnd)} ·{" "}
          {(step.maneuver || "straight").replace(/[-_]/g, " ")}
        </Text>
        {next && !isFinal && (
          <View
            style={{
              marginTop: 16,
              paddingTop: 14,
              borderTopWidth: 1,
              borderTopColor: palette.line,
            }}
          >
            <Text style={{ ...KICKER, color: palette.inkSoft, letterSpacing: 1.6 }}>
              Then
            </Text>
            <Text
              style={{
                marginTop: 4,
                fontFamily: "Geist_600SemiBold",
                fontSize: 15,
                lineHeight: 20,
                color: palette.inkSoft,
              }}
            >
              {next.instruction}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ---------- At stop ----------

function AtStopCard({ trip, live }: { trip: ActiveTrip; live: LiveJourney }) {
  const bus = trip.option.legs.find((l) => l.kind === "bus");
  if (!bus || bus.kind !== "bus") return null;
  return (
    <View style={{ paddingHorizontal: 20 }}>
      <View
        style={{
          borderRadius: 28,
          padding: 22,
          backgroundColor: "rgba(63,74,54,0.10)",
          borderWidth: 1,
          borderColor: "rgba(63,74,54,0.25)",
        }}
      >
        <Text style={{ ...KICKER, color: palette.olive }}>You're at the stop</Text>
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
          Bus {bus.routeShort} · {fmtMin(live.secsToBoard)}
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
          Wait at {bus.board.name}. We'll buzz the moment it pulls in.
        </Text>
      </View>
    </View>
  );
}

// ---------- Boarding prompt ----------

function BoardingPrompt({ trip, live }: { trip: ActiveTrip; live: LiveJourney }) {
  const bus = trip.option.legs.find((l) => l.kind === "bus");
  const [secondsLeft, setSecondsLeft] = useState(30);

  useEffect(() => {
    if (!live.onBoardSuggested) {
      setSecondsLeft(30);
      return;
    }
    const tm = setInterval(() => {
      setSecondsLeft((n) => {
        if (n <= 1) {
          clearInterval(tm);
          confirmOnBoard();
          return 0;
        }
        return n - 1;
      });
    }, 1000);
    return () => clearInterval(tm);
  }, [live.onBoardSuggested]);

  if (!bus || bus.kind !== "bus") return null;
  return (
    <View style={{ paddingHorizontal: 20 }}>
      <View
        style={{
          borderRadius: 28,
          padding: 22,
          backgroundColor: palette.aegeanSoft,
          borderWidth: 1,
          borderColor: "rgba(63,155,178,0.35)",
        }}
      >
        <Text style={{ ...KICKER, color: palette.aegeanDeep }}>Board the bus</Text>
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
          {bus.routeShort} · {bus.routeLong}
        </Text>
        <Text
          style={{
            marginTop: 8,
            fontFamily: "Geist_500Medium",
            fontSize: 13,
            lineHeight: 19,
            color: palette.inkSoft,
          }}
        >
          {live.onBoardSuggested
            ? `Looks like you're on board — auto-confirming in ${secondsLeft}s.`
            : `We'll press-stop at ${bus.alight.name}. Tap "I'm on" once you board.`}
        </Text>
        <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
          <PrimaryButton
            label="I'm on the bus"
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
              confirmOnBoard();
            }}
          />
          <SecondaryButton
            label="I missed it"
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              markMissed();
            }}
          />
        </View>
      </View>
    </View>
  );
}

// ---------- Missed bus rescue ----------

function MissedBusCard({ trip }: { trip: ActiveTrip }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const rescue = async () => {
    setLoading(true);
    setErr(null);
    try {
      const { itineraries } = await fetchPlan({
        from: trip.from,
        to: trip.to,
      });
      if (!itineraries || itineraries.length === 0) {
        setErr("No later options right now. Try again in a minute.");
        return;
      }
      const next = itineraries[0];
      // Rebuild an ActiveTrip in the legacy option shape for the single-leg
      // companion. Multi-leg rescue routes go through 12c.
      const walkIn = next.legs.find((l) => l.kind === "walk");
      const ride = next.legs.find((l) => l.kind === "ride");
      const walkOut = [...next.legs].reverse().find((l) => l.kind === "walk");
      if (
        !walkIn ||
        walkIn.kind !== "walk" ||
        !ride ||
        ride.kind !== "ride" ||
        !walkOut ||
        walkOut.kind !== "walk"
      ) {
        setErr("This route needs multi-leg tracking. Coming very soon.");
        return;
      }
      setActiveTrip({
        startedAt: Date.now(),
        from: trip.from,
        to: trip.to,
        live: { startedAt: Date.now() },
        option: {
          id: next.id,
          totalDurationSec: next.totalDurationSec,
          departureUnix: next.departureUnix,
          arrivalUnix: next.arrivalUnix,
          transfers: next.transfers,
          legs: [
            {
              kind: "walk",
              from: { lat: walkIn.from.lat, lng: walkIn.from.lng, label: walkIn.from.name },
              to: { lat: walkIn.to.lat, lng: walkIn.to.lng, label: walkIn.to.name },
              durationSec: walkIn.durationSec,
              distanceMeters: walkIn.distanceMeters,
            },
            {
              kind: "bus",
              routeId: ride.routeId,
              routeShort: ride.routeShort,
              routeLong: ride.routeLong,
              tripId: ride.tripId,
              board: {
                stopId: ride.board.stopId,
                name: ride.board.name,
                departureUnix: ride.board.departureUnix,
              },
              alight: {
                stopId: ride.alight.stopId,
                name: ride.alight.name,
                arrivalUnix: ride.alight.arrivalUnix,
              },
              delaySec: ride.delaySec,
            },
            {
              kind: "walk",
              from: { lat: walkOut.from.lat, lng: walkOut.from.lng, label: walkOut.from.name },
              to: { lat: walkOut.to.lat, lng: walkOut.to.lng, label: walkOut.to.name },
              durationSec: walkOut.durationSec,
              distanceMeters: walkOut.distanceMeters,
            },
          ],
        },
      });
      router.replace(`/trip/${next.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't refresh right now.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ paddingHorizontal: 20 }}>
      <View
        style={{
          borderRadius: 28,
          padding: 22,
          backgroundColor: palette.ochreSoft,
          borderWidth: 1,
          borderColor: "rgba(201,133,58,0.4)",
        }}
      >
        <Text style={{ ...KICKER, color: palette.ochre }}>Missed the bus</Text>
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
          No stress — we'll find the next one.
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
          We'll re-plan a fresh route to {trip.to.label}.
        </Text>
        <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
          <PrimaryButton
            label={loading ? "Finding…" : "Find another bus"}
            onPress={rescue}
            disabled={loading}
          />
          <SecondaryButton
            label="End trip"
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              clearActiveTrip();
              router.replace("/(tabs)/plan");
            }}
          />
        </View>
        {loading && <ActivityIndicator style={{ marginTop: 14 }} color={palette.ochre} />}
        {err && (
          <Text
            style={{
              marginTop: 12,
              ...KICKER,
              color: palette.ochre,
              letterSpacing: 1.4,
            }}
          >
            {err}
          </Text>
        )}
      </View>
    </View>
  );
}

// ---------- Riding ----------

function RidingCard({ trip, live }: { trip: ActiveTrip; live: LiveJourney }) {
  const bus = trip.option.legs.find((l) => l.kind === "bus");
  if (!bus || bus.kind !== "bus") return null;
  const eta =
    live.fusedSecsToAlight > 0 ? live.fusedSecsToAlight : live.secsToAlight;
  const alightSoon = live.phase === "alight-soon";
  return (
    <View style={{ paddingHorizontal: 20 }}>
      <View
        style={{
          borderRadius: 28,
          padding: 22,
          backgroundColor: palette.white,
          borderWidth: 1,
          borderColor: palette.line,
        }}
      >
        <Text style={{ ...KICKER, color: palette.aegeanDeep }}>
          On board · {bus.routeShort}
        </Text>
        <Text
          style={{
            marginTop: 8,
            fontFamily: "BricolageGrotesque_800ExtraBold",
            fontSize: 28,
            lineHeight: 32,
            letterSpacing: -0.6,
            color: palette.ink,
          }}
        >
          Off in {fmtMin(eta)} at {bus.alight.name}
        </Text>
        <Text
          style={{
            marginTop: 8,
            fontFamily: "Geist_500Medium",
            fontSize: 13,
            lineHeight: 19,
            color: palette.inkSoft,
          }}
        >
          {live.vehicleLost
            ? "We lost the operator feed, so we're tracking you directly. Countdown still fires."
            : "Sit back. We'll buzz two stops before yours, then press-stop with you."}
        </Text>
        {alightSoon && (
          <Pressable
            onPress={() => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
                () => {},
              );
              markAlighted();
            }}
            style={({ pressed }) => ({
              alignSelf: "flex-start",
              marginTop: 18,
              backgroundColor: palette.ink,
              paddingHorizontal: 22,
              paddingVertical: 14,
              borderRadius: 999,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text
              style={{
                fontFamily: "Geist_700Bold",
                fontSize: 14,
                color: palette.limestone,
                letterSpacing: -0.2,
              }}
            >
              I'm off the bus
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

// ---------- Arrived ----------

function ArrivedCard({ trip }: { trip: ActiveTrip }) {
  return (
    <View style={{ paddingHorizontal: 20 }}>
      <View
        style={{
          borderRadius: 28,
          padding: 22,
          backgroundColor: "rgba(63,74,54,0.14)",
          borderWidth: 1,
          borderColor: "rgba(63,74,54,0.3)",
        }}
      >
        <Text style={{ ...KICKER, color: palette.olive }}>You've arrived</Text>
        <Text
          style={{
            marginTop: 8,
            fontFamily: "BricolageGrotesque_800ExtraBold",
            fontSize: 28,
            lineHeight: 32,
            letterSpacing: -0.6,
            color: palette.ink,
          }}
        >
          Welcome to {trip.to.label}.
        </Text>
        <Pressable
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            clearActiveTrip();
            router.replace("/(tabs)");
          }}
          style={({ pressed }) => ({
            alignSelf: "flex-start",
            marginTop: 18,
            backgroundColor: palette.ink,
            paddingHorizontal: 22,
            paddingVertical: 14,
            borderRadius: 999,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Text
            style={{
              fontFamily: "Geist_700Bold",
              fontSize: 14,
              color: palette.limestone,
              letterSpacing: -0.2,
            }}
          >
            Finish trip
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// ---------- Buttons ----------

function PrimaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        backgroundColor: palette.ink,
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 999,
        opacity: disabled ? 0.55 : pressed ? 0.85 : 1,
      })}
    >
      <Text
        style={{
          fontFamily: "Geist_700Bold",
          fontSize: 13,
          color: palette.limestone,
          letterSpacing: -0.2,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function SecondaryButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: palette.white,
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: palette.line,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Text
        style={{
          fontFamily: "Geist_700Bold",
          fontSize: 13,
          color: palette.ink,
          letterSpacing: -0.2,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

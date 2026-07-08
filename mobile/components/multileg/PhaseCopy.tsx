// Phase hero copy — kicker label, big headline and supporting line. Pure
// presentation driven by the live multi-leg phase machine.

import { Text } from "react-native";
import { palette } from "@/constants/theme";
import type { MultiLegLive } from "@/lib/useMultiLegJourney";
import type { Itinerary, RideLeg } from "@/lib/journey-types";
import { KICKER, fmtMin } from "./kit";

// ---------------------------------------------------------------------------
// Hero copy
// ---------------------------------------------------------------------------
export function PhaseLabel({
  live,
  itin,
}: {
  live: MultiLegLive;
  itin: Itinerary;
}) {
  const tone =
    live.phase === "arrived"
      ? palette.olive
      : live.phase === "alight-soon" || live.nextBoardLate
        ? palette.ochre
        : live.phase === "missed-connection"
          ? palette.ochre
          : palette.aegeanDeep;
  const text =
    live.phase === "idle"
      ? "Ready when you are"
      : live.phase === "walking-to-board"
        ? "Walking to first bus"
        : live.phase === "waiting-to-board"
          ? `Waiting for bus ${live.currentRideLeg?.routeShort ?? ""}`
          : live.phase === "riding"
            ? `On bus ${live.currentRideLeg?.routeShort ?? ""} · ${live.rideOrdinal}/${live.totalRides}`
            : live.phase === "alight-soon"
              ? "Alight next"
              : live.phase === "walking-to-transfer"
                ? `Walk to bus ${live.nextRideLeg?.routeShort ?? ""}`
                : live.phase === "waiting-for-connection"
                  ? `Waiting for bus ${live.nextRideLeg?.routeShort ?? ""}`
                  : live.phase === "missed-connection"
                    ? "Missed connection"
                    : live.phase === "walking-to-destination"
                      ? "Final stretch"
                      : "Arrived";
  const detail =
    live.phase === "waiting-for-connection" && live.nextRideLeg
      ? live.nextBoardLate
        ? "running late"
        : live.nextBoardSource === "live"
          ? "live"
          : "scheduled"
      : itin.source === "live"
        ? "live"
        : itin.source === "mixed"
          ? "live + scheduled"
          : "scheduled";
  return (
    <Text style={{ ...KICKER, color: tone }}>
      {text} <Text style={{ color: palette.inkSoft }}>— {detail}</Text>
    </Text>
  );
}

export function PhaseHeadline({
  live,
  itin,
}: {
  live: MultiLegLive;
  itin: Itinerary;
}) {
  const base = {
    marginTop: 10,
    fontFamily: "BricolageGrotesque_800ExtraBold" as const,
    fontSize: 34,
    lineHeight: 38,
    letterSpacing: -0.8,
    color: palette.ink,
  };
  const italic = {
    fontFamily: "BricolageGrotesque_400Regular_Italic" as const,
    color: palette.oliveSoft,
  };
  if (live.phase === "walking-to-board" && live.currentRideLeg) {
    return (
      <Text style={base}>
        Walk to{" "}
        <Text style={{ color: palette.aegeanDeep }}>
          {live.currentRideLeg.board.name}
        </Text>
        {"\n"}
        <Text style={italic}>
          Bus {live.currentRideLeg.routeShort} in{" "}
          {fmtMin(live.secsToCurrentBoard)} min
        </Text>
      </Text>
    );
  }
  if (live.phase === "waiting-to-board" && live.currentRideLeg) {
    return (
      <Text style={base}>
        Bus {live.currentRideLeg.routeShort} in{" "}
        <Text style={{ color: palette.aegeanDeep }}>
          {fmtMin(live.secsToCurrentBoard)}
        </Text>{" "}
        min
        {"\n"}
        <Text style={italic}>at {live.currentRideLeg.board.name}</Text>
      </Text>
    );
  }
  if (live.phase === "riding" && live.currentRideLeg) {
    return (
      <Text style={base}>
        Off in{" "}
        <Text style={{ color: palette.aegeanDeep }}>
          {fmtMin(live.secsToCurrentAlight)}
        </Text>{" "}
        min
        {"\n"}
        <Text style={italic}>
          at {live.currentRideLeg.alight.name}
          {live.nextRideLeg
            ? ` — then change to ${live.nextRideLeg.routeShort}`
            : "."}
        </Text>
      </Text>
    );
  }
  if (live.phase === "alight-soon" && live.currentRideLeg) {
    return (
      <Text style={base}>
        Step off <Text style={{ color: palette.ochre }}>next</Text>
        {"\n"}
        <Text style={italic}>{live.currentRideLeg.alight.name}.</Text>
      </Text>
    );
  }
  if (
    live.phase === "walking-to-transfer" &&
    live.nextRideLeg &&
    live.currentLeg?.kind === "walk"
  ) {
    return (
      <Text style={base}>
        Walk to{" "}
        <Text style={{ color: palette.aegeanDeep }}>
          {live.nextRideLeg.board.name}
        </Text>
        {"\n"}
        <Text style={italic}>
          {fmtMin(live.currentLeg.durationSec)} min for bus{" "}
          {live.nextRideLeg.routeShort}
        </Text>
      </Text>
    );
  }
  if (live.phase === "waiting-for-connection" && live.nextRideLeg) {
    return (
      <Text style={base}>
        Bus {live.nextRideLeg.routeShort} in{" "}
        <Text
          style={{
            color: live.nextBoardLate ? palette.ochre : palette.aegeanDeep,
          }}
        >
          {fmtMin(live.secsToNextBoard)}
        </Text>{" "}
        min
        {"\n"}
        <Text style={italic}>at {live.nextRideLeg.board.name}</Text>
      </Text>
    );
  }
  if (live.phase === "missed-connection" && live.nextRideLeg) {
    return (
      <Text style={base}>
        Missed bus{" "}
        <Text style={{ color: palette.ochre }}>
          {live.nextRideLeg.routeShort}
        </Text>
        {"\n"}
        <Text style={italic}>We can find you a new way from here.</Text>
      </Text>
    );
  }
  if (live.phase === "walking-to-destination") {
    return (
      <Text style={base}>
        Final stretch
        {"\n"}
        <Text style={italic}>
          {fmtMin(
            live.currentLeg?.kind === "walk"
              ? live.currentLeg.durationSec
              : 0,
          )}{" "}
          min on foot
        </Text>
      </Text>
    );
  }
  if (live.phase === "arrived") {
    return (
      <Text style={base}>
        You're <Text style={{ color: palette.olive }}>there</Text>
        {"\n"}
        <Text style={italic}>Welcome. Have a great one.</Text>
      </Text>
    );
  }
  const firstRide = itin.legs.find((l): l is RideLeg => l.kind === "ride");
  return (
    <Text style={base}>
      Door to door{" "}
      <Text style={{ color: palette.aegeanDeep }}>
        {Math.round(itin.totalDurationSec / 60)}
      </Text>{" "}
      min
      {"\n"}
      <Text style={italic}>
        Starting on bus {firstRide?.routeShort ?? ""}
      </Text>
    </Text>
  );
}

export function PhaseSub({
  live,
  itin,
  destLabel,
}: {
  live: MultiLegLive;
  itin: Itinerary;
  destLabel: string;
}) {
  const changesLabel =
    itin.transfers === 1 ? "1 change" : `${itin.transfers} changes`;
  const text =
    live.phase === "idle"
      ? `${changesLabel} · we'll keep you on time.`
      : live.phase === "walking-to-board"
        ? "Head to your first stop. We'll flip the moment you're there."
        : live.phase === "waiting-to-board"
          ? "We'll ping you the moment to board."
          : live.phase === "riding"
            ? live.nextRideLeg
              ? `Change to bus ${live.nextRideLeg.routeShort} at ${live.currentRideLeg?.alight.name ?? ""}.`
              : "Sit tight. We'll press stop for you."
            : live.phase === "alight-soon"
              ? live.nextRideLeg
                ? `Then walk to ${live.nextRideLeg.board.name} for bus ${live.nextRideLeg.routeShort}.`
                : `Then a short walk to ${destLabel}.`
              : live.phase === "walking-to-transfer"
                ? live.nextRideLeg
                  ? `Bus ${live.nextRideLeg.routeShort} in ${fmtMin(live.secsToNextBoard)} min at the transfer stop.`
                  : "Head to your next stop."
                : live.phase === "waiting-for-connection"
                  ? live.nextBoardLate
                    ? "The connecting bus is running late. We'll keep updating."
                    : "We're watching this stop for you."
                  : live.phase === "missed-connection"
                    ? "We'll plan the next best route from here."
                    : live.phase === "walking-to-destination"
                      ? `About ${fmtMin(live.currentLeg?.kind === "walk" ? live.currentLeg.durationSec : 0)} min to ${destLabel}.`
                      : `Welcome to ${destLabel}.`;
  return (
    <Text
      style={{
        marginTop: 16,
        fontFamily: "Geist_500Medium",
        fontSize: 13,
        lineHeight: 20,
        color: palette.inkSoft,
      }}
    >
      {text}
    </Text>
  );
}

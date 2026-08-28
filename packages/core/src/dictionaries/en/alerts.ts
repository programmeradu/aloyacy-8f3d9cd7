// English source of truth. Add a key here first, then translate in the matching el/ file.
// Use {placeholders} for interpolation: t("greet", { name: "Andreas" }).

export const alerts = {
  "disruption.label.runningLate": "Heads up",
  "disruption.label.connectionAtRisk": "Tight connection",
  "disruption.label.missedConnection": "Plan B",
  "disruption.label.vehicleLostFeed": "Tracking",
  "disruption.label.ghostPreBoard": "Ghost bus",
  "disruption.label.latePreBoard": "Running late",
  "disruption.fasterRoute": "Find a faster route",

  "stale.feedStale.label": "Live feed paused",
  "stale.feedStale.detail":
    "We can't reach the bus tracking service right now. Times shown are scheduled — we'll switch back the moment the feed returns.",
  "stale.vehicleLost.label": "Tracking from your phone",
  "stale.vehicleLost.detail":
    "We lost sight of the bus on the live feed — using your GPS to keep the map and countdown honest until it comes back.",
  "stale.nextNotTracked.label": "Next bus not yet tracked",
  "stale.nextNotTracked.detail":
    "Your connecting bus hasn't started sending its location yet. We'll surface it the moment it does.",
  "stale.ghostBus.label": "No GPS for this bus",
  "stale.ghostBus.detail":
    "We haven't received a position from this vehicle in over 3 minutes. Showing the scheduled time — treat it as an estimate.",

  "eta.tier.live": "live",
  "eta.tier.rider": "rider-confirmed",
  "eta.tier.riderOne": "one rider",
  "eta.tier.predicted": "predicted",
  "eta.tier.ghost": "no gps",
  "eta.tier.scheduled": "scheduled",
  "eta.conf.high": "high confidence",
  "eta.conf.med": "medium confidence",
  "eta.conf.low": "low confidence",
  "eta.minLabel": "min away",
  "eta.opShort": "op {m} min",

  "sighting.kicker": "Can you see this bus?",
  "sighting.cta": "Confirm — I see it now",
  "sighting.help":
    "Tap if the bus is at the stop. Your tap upgrades it from 'no GPS' for everyone else.",
  "sighting.sending": "Sending…",
  "sighting.thanksLabel": "Thanks — rider-confirmed",
  "sighting.thanksDetail":
    "Other riders will see this trip as confirmed for the next minute or so.",
  "sighting.onboard.kicker": "Still on Bus {code}?",
  "sighting.onboard.cta": "Yes — I'm on it",
  "sighting.onboard.help":
    "People at the next stops are waiting. Your tap is what they see as rider-confirmed.",
  "sighting.onboard.thanksLabel": "Thanks — they're seeing this bus",
  "sighting.onboard.thanksDetail":
    "Other riders will see Bus {code} as rider-confirmed for the next minute.",

  "crowd.tag": "Comfort",
  "crowd.quiet": "Plenty of seats — quiet ride.",
  "crowd.moderate": "Some seats free.",
  "crowd.busy": "Busy — standing likely.",
  "crowd.packed": "Packed — consider the next bus if you can.",
  "crowd.weather.storm": "Storms at arrival — bring cover.",
  "crowd.weather.rain": "Rain at arrival — bring cover.",
  "crowd.weather.wind": "Windy at arrival.",
  "crowd.weather.hot": "Hot at arrival ({temp}°).",
  "crowd.weather.cold": "Cold at arrival ({temp}°).",
  "crowd.fromRiders": "From {n} recent riders",

  "lfw.kicker": "Last stretch — long on foot",
  "lfw.headPrefix": "Roughly",
  "lfw.headTo": "left to {dest}.",
  "lfw.head": "left.",
  "lfw.openMaps": "Open walk in Google Maps",
  "lfw.line.hike":
    "That's a real hike {where} — about {min} min on foot from here. No bus gets closer, so take it slow or save it for another time.",
  "lfw.line.longNight":
    "Around {min} min walking {where}, and it's getting late. The route's below if you'd like to follow it.",
  "lfw.line.long":
    "You're about {min} min on foot {where} — a proper walk. Stretch out and follow the route below.",
  "lfw.line.warm":
    "Roughly {min} min walking {where}. Bit warm out — take water if you have it. Turn-by-turn is just below.",
  "lfw.line.night":
    "About {min} min walking {where} from here. Quiet streets at this hour — the route's below.",
  "lfw.line.default":
    "About {min} min walking {where} from here — no bus gets closer. The turn-by-turn is just below.",
  "lfw.toDest": "to {dest}",
  "lfw.toYourDest": "to your destination",

  "reliability.label": "Reliability",
  "reliability.headline": "On time {pct}%",
  "reliability.notEnough": "Learning this route",
  "reliability.subAvgLate": "Avg {sec}s late",
  "reliability.subAvgEarly": "Avg {sec}s early",
  "reliability.subAvgOnTime": "Avg on the dot",
  "reliability.subLearning": "Not enough data yet",
  "reliability.samples": "{n} observations",
  "reliability.stopEyebrow": "At this stop",
  "reliability.stopHeadline": "On time {pct}%",
  "reliability.stopLearning": "Learning this stop",
  "reliability.stopSub": "{n} observations · avg {sec}s",
  "reliability.onTime": "on time",
  "reliability.summaryLearning": "Still learning this line",
  "reliability.summaryOnTime": "Usually runs on time",
  "reliability.summaryLateSmall": "Usually a minute or two late",
  "reliability.summaryLateBig": "Often runs late",
  "reliability.summaryEarlySmall": "Sometimes leaves a touch early",
  "reliability.summaryEarlyBig": "Often leaves early",
  "reliability.hintLearning": "Not enough rider data yet",
  "reliability.hintHigh": "Safe to plan tight connections",
  "reliability.hintMedium": "Give yourself a small buffer",
  "reliability.hintLow": "Leave a few minutes of buffer",

  "rationale.eyebrow": "Why this option",
  "rationale.fastest": "Arrives {m} min earlier",
  "rationale.noChanges": "No changes",
  "rationale.fewerChangesOne": "Only one change",
  "rationale.fewerChanges": "Fewer changes",
  "rationale.lessWalking": "{m} m less walking",
  "rationale.allLive": "Live data the whole way",
  "rationale.moreReliable": "Smaller delays right now",
  "rationale.leavesSooner": "Leaves {m} min sooner",
  "rationale.bestOverall": "Best balance of time, transfers and walking",
} as const;

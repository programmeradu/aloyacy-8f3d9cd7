// Greek translations. Keep keys aligned with the matching en/ file. Missing keys fall back
// to English at runtime, so partial coverage is safe to ship.

import type { en } from "../en";

import { common } from "./common";
import { home } from "./home";
import { onboarding } from "./onboarding";
import { legal } from "./legal";
import { trip } from "./trip";
import { hud } from "./hud";
import { multileg } from "./multileg";
import { stop } from "./stop";
import { route } from "./route";
import { trips } from "./trips";
import { mobility } from "./mobility";
import { intercity } from "./intercity";
import { saved } from "./saved";
import { wallet } from "./wallet";
import { alerts } from "./alerts";
import { replan } from "./replan";
import { assistant } from "./assistant";
import { pulse } from "./pulse";
import { greenLine } from "./green-line";
import { airport } from "./airport";
import { sky } from "./sky";

export const el: Record<keyof typeof en, string> = {
  ...common,
  ...home,
  ...onboarding,
  ...legal,
  ...trip,
  ...hud,
  ...multileg,
  ...stop,
  ...route,
  ...trips,
  ...mobility,
  ...intercity,
  ...saved,
  ...wallet,
  ...alerts,
  ...replan,
  ...assistant,
  ...pulse,
  ...greenLine,
  ...airport,
  ...sky,
} as const;

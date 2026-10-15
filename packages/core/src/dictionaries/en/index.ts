// English source of truth. Add a key here first, then translate in the matching el/ file.
// Use {placeholders} for interpolation: t("greet", { name: "Andreas" }).

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

export const en = {
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

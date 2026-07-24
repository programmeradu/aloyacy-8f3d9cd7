// Share cards, split by surface. Kept as a barrel so existing imports of
// `@/lib/shareCard` keep working.

export type { Bg } from "./shareCard-theme";
export { renderStopShareCard, type StopCardCtx } from "./shareCard-stop";
export { renderPlanShareCard, type PlanCardCtx } from "./shareCard-plan";

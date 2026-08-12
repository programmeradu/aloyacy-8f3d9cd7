// Haptics stub — records the feedback pattern the code requested.

export enum ImpactFeedbackStyle {
  Light = "light",
  Medium = "medium",
  Heavy = "heavy",
}

export enum NotificationFeedbackType {
  Success = "success",
  Warning = "warning",
  Error = "error",
}

const events: string[] = [];

export async function impactAsync(style: ImpactFeedbackStyle = ImpactFeedbackStyle.Light) {
  events.push(`impact:${style}`);
}

export async function notificationAsync(
  type: NotificationFeedbackType = NotificationFeedbackType.Success,
) {
  events.push(`notification:${type}`);
}

export async function selectionAsync() {
  events.push("selection");
}

export function __hapticEvents() {
  return [...events];
}

export function __resetHaptics() {
  events.length = 0;
}

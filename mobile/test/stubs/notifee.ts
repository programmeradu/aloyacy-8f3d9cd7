// In-memory stand-in for @notifee/react-native.
//
// The real package is an Android/iOS native module: importing it under Node
// throws. This stub keeps the same call surface and records everything, so
// scheduling logic can be asserted on ("did we schedule a trigger at T-5min?")
// without a device.

export type StubNotification = Record<string, unknown> & { id?: string };

type Recorded = {
  channels: Array<Record<string, unknown>>;
  displayed: StubNotification[];
  triggers: Array<{ notification: StubNotification; trigger: Record<string, unknown> }>;
  cancelled: string[];
  permissionRequests: number;
};

const g = globalThis as typeof globalThis & { __aloyaNotifee?: Recorded };

export function __notifee(): Recorded {
  return (g.__aloyaNotifee ??= {
    channels: [],
    displayed: [],
    triggers: [],
    cancelled: [],
    permissionRequests: 0,
  });
}

export function __resetNotifee() {
  g.__aloyaNotifee = undefined;
  return __notifee();
}

export const AndroidImportance = {
  NONE: 0,
  MIN: 1,
  LOW: 2,
  DEFAULT: 3,
  HIGH: 4,
} as const;

export const AndroidVisibility = { SECRET: -1, PRIVATE: 0, PUBLIC: 1 } as const;

export const TriggerType = { TIMESTAMP: 0, INTERVAL: 1 } as const;

export const AuthorizationStatus = {
  NOT_DETERMINED: -1,
  DENIED: 0,
  AUTHORIZED: 1,
  PROVISIONAL: 2,
} as const;

export type TimestampTrigger = {
  type: (typeof TriggerType)["TIMESTAMP"];
  timestamp: number;
  alarmManager?: unknown;
};

const notifee = {
  async createChannel(channel: Record<string, unknown>) {
    __notifee().channels.push(channel);
    return String(channel.id ?? "channel");
  },
  async displayNotification(notification: StubNotification) {
    __notifee().displayed.push(notification);
    return String(notification.id ?? `n${__notifee().displayed.length}`);
  },
  async createTriggerNotification(
    notification: StubNotification,
    trigger: Record<string, unknown>,
  ) {
    __notifee().triggers.push({ notification, trigger });
    return String(notification.id ?? `t${__notifee().triggers.length}`);
  },
  async cancelNotification(id: string) {
    __notifee().cancelled.push(id);
  },
  async cancelAllNotifications() {
    const state = __notifee();
    for (const t of state.triggers) if (t.notification.id) state.cancelled.push(t.notification.id);
  },
  async getTriggerNotificationIds() {
    return __notifee().triggers.map((t) => String(t.notification.id ?? ""));
  },
  async requestPermission() {
    __notifee().permissionRequests += 1;
    return { authorizationStatus: AuthorizationStatus.AUTHORIZED };
  },
  onForegroundEvent() {
    return () => {};
  },
  onBackgroundEvent() {},
};

export default notifee;

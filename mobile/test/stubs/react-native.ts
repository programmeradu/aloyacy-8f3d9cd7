// Minimal `react-native` surface used by the logic modules under test.
// Only platform/utility APIs are provided — no component rendering, which is
// exercised on-device rather than in this Node harness.

export const Platform = {
  OS: "ios" as "ios" | "android" | "web",
  select<T>(spec: { ios?: T; android?: T; web?: T; default?: T }): T | undefined {
    return spec[Platform.OS] ?? spec.default;
  },
};

const opened: string[] = [];

export const Linking = {
  async openURL(url: string): Promise<void> {
    opened.push(url);
  },
  async canOpenURL(): Promise<boolean> {
    return true;
  },
  async getInitialURL(): Promise<string | null> {
    return null;
  },
  addEventListener() {
    return { remove() {} };
  },
  __opened: opened,
};

export const Share = {
  async share(content: { message?: string; url?: string }) {
    return { action: "sharedAction" as const, activityType: null, content };
  },
};

export const Dimensions = {
  get() {
    return { width: 390, height: 844, scale: 3, fontScale: 1 };
  },
  addEventListener() {
    return { remove() {} };
  },
};

export const Alert = { alert() {} };

export const AppState = {
  currentState: "active" as string,
  addEventListener() {
    return { remove() {} };
  },
};

export const NativeModules: Record<string, unknown> = {};

export const StyleSheet = {
  create<T extends Record<string, unknown>>(styles: T): T {
    return styles;
  },
  flatten<T>(style: T): T {
    return style;
  },
  hairlineWidth: 1,
};

export const Vibration = { vibrate() {}, cancel() {} };

export const InteractionManager = {
  runAfterInteractions(cb: () => void) {
    cb();
    return { cancel() {} };
  },
};

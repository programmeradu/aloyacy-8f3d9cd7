/** Minimal react-native surface used by the framework-free lib modules. */
export const Platform = {
  OS: "ios" as "ios" | "android" | "web",
  select: <T,>(spec: { ios?: T; android?: T; web?: T; default?: T }) =>
    spec.ios ?? spec.default,
};

export const NativeModules: Record<string, unknown> = {};

export const Linking = {
  openURL: async (_url: string) => undefined,
  canOpenURL: async (_url: string) => true,
};

export const Share = {
  share: async (_content: unknown) => ({ action: "sharedAction" as const }),
};

export const Appearance = {
  getColorScheme: () => "light" as const,
  addChangeListener: () => ({ remove: () => undefined }),
};

export const Dimensions = {
  get: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }),
  addEventListener: () => ({ remove: () => undefined }),
};

export const AppState = {
  currentState: "active" as const,
  addEventListener: () => ({ remove: () => undefined }),
};

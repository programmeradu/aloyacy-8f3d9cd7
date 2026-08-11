/** Mirrors the shape `mobile/lib` reads: extra config plus app version. */
const Constants = {
  expoConfig: {
    version: "1.0.0",
    extra: {} as Record<string, unknown>,
    ios: { buildNumber: "1" },
    android: { versionCode: 1 },
  },
  easConfig: null,
  sessionId: "test-session",
};

export default Constants;

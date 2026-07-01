// Dynamic Expo config. Reads app.json as the base and layers in runtime
// values that need env-var access (e.g. the Android Google Maps API key,
// which cannot live in a static JSON file if we want per-environment keys).
//
// Set EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY in `mobile/eas.json` env blocks
// (or `.env` for local `expo start`) with a key from Google Cloud that has
// "Maps SDK for Android" enabled and — for production — an Android app
// restriction bound to package `cy.aloya.app` + the release SHA-1.
//
// iOS uses Apple Maps via expo-maps and needs no key.

import type { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => {
  const androidMapsKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY;
  return {
    ...(config as ExpoConfig),
    android: {
      ...(config.android ?? {}),
      config: {
        ...(config.android?.config ?? {}),
        ...(androidMapsKey
          ? { googleMaps: { apiKey: androidMapsKey } }
          : {}),
      },
    },
  };
};

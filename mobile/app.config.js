module.exports = ({ config }) => {
  const androidMapsKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY;
  return {
    ...config,
    android: {
      ...config.android,
      config: {
        ...(config.android?.config ?? {}),
        ...(androidMapsKey
          ? { googleMaps: { apiKey: androidMapsKey } }
          : {}),
      },
    },
  };
};

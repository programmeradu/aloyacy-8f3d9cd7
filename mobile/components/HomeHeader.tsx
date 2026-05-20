import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { palette } from "@/constants/theme";
import { assets } from "@/lib/assets";
import { useLocale, LOCALES, type Locale } from "@/lib/i18n";
import { useWeather, type MobileWeather } from "@/lib/useWeather";

const DAY_NAMES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

const VIGNETTES: Record<MobileWeather["iconKey"], { uri: string }> = {
  sun: assets.weather_sun,
  moon: assets.weather_moon,
  cloud: assets.weather_cloud,
  rain: assets.weather_rain,
  storm: assets.weather_storm,
  wind: assets.weather_wind,
};

export function HomeHeader({ here }: { here: { lat: number; lng: number } | null }) {
  const { locale, setLocale } = useLocale();
  const { data: weather } = useWeather(here);
  const dayLabel = DAY_NAMES[new Date().getDay()];
  const vignette = VIGNETTES[weather?.iconKey ?? "sun"];

  return (
    <View style={styles.wrap}>
      <View>
        <View style={styles.logoRow}>
          <Text style={styles.logo}>Aloya</Text>
          <Text style={styles.logoTag}>CY</Text>
        </View>
        <View style={styles.localeRow}>
          {LOCALES.map((code, i) => (
            <View key={code} style={styles.localeItem}>
              {i > 0 ? <View style={styles.localeDivider} /> : null}
              <Pressable onPress={() => setLocale(code as Locale)} hitSlop={8}>
                <Text
                  style={[
                    styles.localeCode,
                    code === locale && styles.localeCodeActive,
                  ]}
                >
                  {code.toUpperCase()}
                </Text>
              </Pressable>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.stamp}>
        <Image source={vignette} style={styles.vignette} resizeMode="contain" />
        <View style={styles.stampText}>
          <Text style={styles.day}>{dayLabel}</Text>
          <Text style={styles.temp}>
            {weather ? (
              <>
                {weather.tempC}
                <Text style={styles.deg}>°</Text>
              </>
            ) : (
              <Text style={styles.dash}>—</Text>
            )}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 22,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  logoRow: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  logo: {
    fontFamily: "BricolageGrotesque_800ExtraBold",
    fontStyle: "italic",
    fontSize: 28,
    lineHeight: 30,
    color: palette.ink,
  },
  logoTag: {
    fontFamily: "JetBrainsMono_500Medium",
    fontSize: 9,
    letterSpacing: 2.4,
    color: palette.inkSoft,
    textTransform: "uppercase",
  },
  localeRow: { marginTop: 6, flexDirection: "row", alignItems: "center" },
  localeItem: { flexDirection: "row", alignItems: "center" },
  localeDivider: {
    width: 1,
    height: 10,
    marginHorizontal: 8,
    backgroundColor: "rgba(31,30,24,0.22)",
  },
  localeCode: {
    fontFamily: "Geist_700Bold",
    fontSize: 11,
    letterSpacing: 0.4,
    color: "rgba(31,30,24,0.42)",
  },
  localeCodeActive: { color: palette.ink },
  stamp: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingLeft: 2,
    paddingRight: 6,
  },
  vignette: { width: 62, height: 62, marginVertical: -8 },
  stampText: { alignItems: "flex-end" },
  day: {
    fontFamily: "JetBrainsMono_500Medium",
    fontSize: 9,
    letterSpacing: 2.8,
    color: palette.inkSoft,
  },
  temp: {
    marginTop: 4,
    fontFamily: "BricolageGrotesque_800ExtraBold",
    fontSize: 26,
    lineHeight: 26,
    color: palette.ink,
  },
  deg: { color: palette.ochre },
  dash: { color: palette.inkSoft },
});

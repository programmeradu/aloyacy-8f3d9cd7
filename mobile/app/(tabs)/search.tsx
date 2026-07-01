import { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { palette } from "@/constants/theme";
import { useStopsBundle, useGeoFix } from "@/lib/hooks";
import { distanceMeters, formatDistance } from "@/lib/format";

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState("");
  const bundle = useStopsBundle();
  const { fix } = useGeoFix();

  const results = useMemo(() => {
    if (!bundle.data) return [];
    const query = q.trim().toLowerCase();
    if (!query) {
      // Empty query: surface nearest stops as a starting point.
      if (!fix) return bundle.data.stops.slice(0, 20);
      return bundle.data.stops
        .map((s) => ({ ...s, _d: distanceMeters(fix, s) }))
        .sort((a, b) => (a as { _d: number })._d - (b as { _d: number })._d)
        .slice(0, 20);
    }
    return bundle.data.stops
      .filter(
        (s) =>
          s.name.toLowerCase().includes(query) ||
          s.code.toLowerCase().includes(query),
      )
      .slice(0, 40);
  }, [bundle.data, q, fix]);

  return (
    <View style={{ flex: 1, backgroundColor: palette.limestone }}>
      <View
        style={{
          paddingTop: insets.top + 12,
          paddingHorizontal: 20,
          paddingBottom: 12,
        }}
      >
        <Text
          style={{
            fontFamily: "BricolageGrotesque_800ExtraBold",
            fontSize: 30,
            color: palette.ink,
            letterSpacing: -0.8,
          }}
        >
          Search
        </Text>
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Stop name or code"
          placeholderTextColor={palette.inkSoft}
          autoFocus
          autoCorrect={false}
          style={{
            marginTop: 16,
            backgroundColor: palette.white,
            borderWidth: 1,
            borderColor: palette.line,
            borderRadius: 16,
            paddingHorizontal: 16,
            paddingVertical: 14,
            fontSize: 16,
            fontFamily: "Geist_500Medium",
            color: palette.ink,
          }}
        />
      </View>

      {bundle.isLoading ? (
        <View style={{ paddingVertical: 60, alignItems: "center" }}>
          <ActivityIndicator color={palette.aegeanDeep} />
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(s) => s.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
          ItemSeparatorComponent={() => (
            <View style={{ height: 1, backgroundColor: palette.line }} />
          )}
          ListEmptyComponent={
            <Text
              style={{
                color: palette.inkSoft,
                fontFamily: "Geist_500Medium",
                textAlign: "center",
                paddingVertical: 40,
              }}
            >
              No stops match “{q}”.
            </Text>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/stop/${item.id}`)}
              style={({ pressed }) => ({
                paddingVertical: 14,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Text
                numberOfLines={1}
                style={{
                  fontFamily: "Geist_600SemiBold",
                  fontSize: 16,
                  color: palette.ink,
                }}
              >
                {item.name}
              </Text>
              <Text
                style={{
                  fontFamily: "Geist_700Bold",
                  fontSize: 12,
                  color: palette.inkSoft,
                  marginTop: 2,
                }}
              >
                {item.agency} · stop {item.code}
              </Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

// Omni-search for the Today screen: one field over stops, routes, live buses
// and airports. Ranking is the shared `@aloya/core/home-search` implementation
// so mobile and web return the same hits in the same order.

import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { router } from "expo-router";
import Svg, { Circle, Path } from "react-native-svg";
import { palette } from "@/constants/theme";
import { searchResultBadge, searchResultCopy, searchResultHref } from "@aloya/core/home-board";
import type { SearchResult } from "@aloya/core/home-search";

export function HomeSearchBar({
  value,
  onChange,
  results,
}: {
  value: string;
  onChange: (next: string) => void;
  results: SearchResult[];
}) {
  const typed = value.trim().length > 0;
  const open = (hit: SearchResult) => router.push(searchResultHref(hit));

  return (
    <View style={styles.wrap}>
      <View style={styles.field}>
        <SearchGlyph />
        <View style={{ flex: 1, minWidth: 0 }}>
          <TextInput
            value={value}
            onChangeText={onChange}
            placeholder="Stops, routes, buses, airports"
            placeholderTextColor={palette.inkSoft}
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={() => {
              const first = results[0];
              if (first) open(first);
            }}
            style={styles.input}
          />
          <Text style={styles.hint}>Search the full live network</Text>
        </View>
      </View>

      {typed && (
        <View style={styles.results}>
          {results.length === 0 ? (
            <Text style={styles.empty}>No matches for “{value.trim()}”.</Text>
          ) : (
            results.map((hit, i) => {
              const copy = searchResultCopy(hit);
              return (
                <Pressable
                  key={`${hit.kind}:${hit.id}:${i}`}
                  onPress={() => open(hit)}
                  style={({ pressed }) => [
                    styles.row,
                    i === results.length - 1 && { borderBottomWidth: 0 },
                    pressed && { opacity: 0.65 },
                  ]}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.name} numberOfLines={2}>
                      {copy.primary}
                    </Text>
                    <Text style={styles.meta} numberOfLines={2}>
                      {searchResultBadge(hit)}  {copy.meta}
                    </Text>
                  </View>
                  <Text style={styles.go}>OPEN</Text>
                </Pressable>
              );
            })
          )}
        </View>
      )}
    </View>
  );
}

function SearchGlyph() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Circle cx={11} cy={11} r={6.2} stroke={palette.ink} strokeWidth={2} />
      <Path d="m15.7 15.7 4 4" stroke={palette.ink} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 20, marginTop: 22 },
  field: {
    minHeight: 64,
    borderRadius: 24,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.line,
    shadowColor: "#1F1E18",
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  input: {
    fontFamily: "Geist_600SemiBold",
    fontSize: 15.5,
    color: palette.ink,
    padding: 0,
    minHeight: 24,
  },
  hint: {
    marginTop: 2,
    fontFamily: "Geist_700Bold",
    fontSize: 9.5,
    letterSpacing: 1.4,
    color: palette.inkSoft,
    textTransform: "uppercase",
  },
  results: {
    marginTop: 8,
    borderRadius: 22,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.line,
    overflow: "hidden",
  },
  row: {
    minHeight: 62,
    paddingHorizontal: 16,
    paddingVertical: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
  },
  name: {
    fontFamily: "Geist_600SemiBold",
    fontSize: 15,
    lineHeight: 19,
    color: palette.ink,
  },
  meta: {
    marginTop: 3,
    fontFamily: "Geist_700Bold",
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 1.5,
    color: palette.inkSoft,
    textTransform: "uppercase",
  },
  go: {
    fontFamily: "Geist_700Bold",
    fontSize: 9.5,
    letterSpacing: 1.8,
    color: palette.aegeanDeep,
  },
  empty: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontFamily: "Geist_500Medium",
    fontSize: 13,
    lineHeight: 18,
    color: palette.inkSoft,
  },
});

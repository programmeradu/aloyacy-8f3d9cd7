// Mobile Places autocomplete input — debounced query against the public
// places autocomplete endpoint. Mirrors the web pattern: bias to current
// location, dropdown of suggestions, tap to resolve a placeId into a
// usable lat/lng/label. Editorial Aloya treatment, no icons.
import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
} from "react-native";
import * as Haptics from "expo-haptics";
import { palette } from "@/constants/theme";
import {
  autocompletePlaces,
  resolvePlace,
  type PlaceSuggestion,
} from "@/lib/places";

export type PickedPlace = { lat: number; lng: number; label: string };

export function PlacesAutocomplete({
  label,
  placeholder,
  bias,
  initialQuery = "",
  onPick,
  onClose,
  autoFocus = true,
}: {
  label: "FROM" | "TO";
  placeholder: string;
  bias?: { lat: number; lng: number };
  initialQuery?: string;
  onPick: (place: PickedPlace) => void;
  onClose?: () => void;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const id = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const out = await autocompletePlaces({ query: trimmed, bias });
        if (id === seq.current) setSuggestions(out);
      } catch {
        if (id === seq.current) setSuggestions([]);
      } finally {
        if (id === seq.current) setLoading(false);
      }
    }, 180);
    return () => clearTimeout(t);
  }, [query, bias?.lat, bias?.lng]);

  async function handlePick(s: PlaceSuggestion) {
    setResolving(s.placeId);
    try {
      await Haptics.selectionAsync();
      const place = await resolvePlace(s.placeId);
      onPick({ lat: place.lat, lng: place.lng, label: place.name });
    } catch {
      // swallow; user can retry
    } finally {
      setResolving(null);
    }
  }

  return (
    <View style={{ gap: 8 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          backgroundColor: palette.white,
          borderWidth: 1,
          borderColor: palette.line,
          borderRadius: 14,
          paddingHorizontal: 14,
          paddingVertical: 12,
        }}
      >
        <Text
          style={{
            fontFamily: "Geist_700Bold",
            fontSize: 10,
            color: palette.inkSoft,
            letterSpacing: 0.5,
          }}
        >
          {label}
        </Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={placeholder}
          placeholderTextColor={palette.inkSoft}
          autoFocus={autoFocus}
          autoCorrect={false}
          autoCapitalize="none"
          style={{
            flex: 1,
            fontSize: 15,
            fontFamily: "Geist_500Medium",
            color: palette.ink,
            padding: 0,
          }}
        />
        {loading ? (
          <ActivityIndicator size="small" color={palette.aegean} />
        ) : query.length > 0 ? (
          <Pressable
            onPress={() => {
              setQuery("");
              setSuggestions([]);
            }}
            hitSlop={10}
          >
            <Text
              style={{
                fontFamily: "Geist_700Bold",
                fontSize: 11,
                color: palette.inkSoft,
                letterSpacing: 0.4,
              }}
            >
              CLEAR
            </Text>
          </Pressable>
        ) : onClose ? (
          <Pressable onPress={onClose} hitSlop={10}>
            <Text
              style={{
                fontFamily: "Geist_700Bold",
                fontSize: 11,
                color: palette.inkSoft,
                letterSpacing: 0.4,
              }}
            >
              CLOSE
            </Text>
          </Pressable>
        ) : null}
      </View>

      {suggestions.length > 0 && (
        <View
          style={{
            backgroundColor: palette.white,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: palette.line,
            overflow: "hidden",
          }}
        >
          {suggestions.map((s, idx) => (
            <Pressable
              key={s.placeId}
              onPress={() => handlePick(s)}
              disabled={resolving !== null}
              style={({ pressed }) => ({
                paddingVertical: 12,
                paddingHorizontal: 14,
                borderBottomWidth: idx < suggestions.length - 1 ? 1 : 0,
                borderBottomColor: palette.line,
                opacity: pressed || resolving === s.placeId ? 0.55 : 1,
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
              })}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  style={{
                    fontFamily: "Geist_600SemiBold",
                    color: palette.ink,
                    fontSize: 14,
                  }}
                  numberOfLines={1}
                >
                  {s.primary}
                </Text>
                {s.secondary ? (
                  <Text
                    style={{
                      fontFamily: "Geist_500Medium",
                      color: palette.inkSoft,
                      fontSize: 12,
                      marginTop: 2,
                    }}
                    numberOfLines={1}
                  >
                    {s.secondary}
                  </Text>
                ) : null}
              </View>
              {resolving === s.placeId ? (
                <ActivityIndicator size="small" color={palette.aegean} />
              ) : null}
            </Pressable>
          ))}
        </View>
      )}

      {query.trim().length >= 2 && !loading && suggestions.length === 0 && (
        <Text
          style={{
            fontFamily: "Geist_500Medium",
            color: palette.inkSoft,
            fontSize: 12,
            paddingHorizontal: 4,
          }}
        >
          No matches. Try a landmark, street, or town name.
        </Text>
      )}
    </View>
  );
}

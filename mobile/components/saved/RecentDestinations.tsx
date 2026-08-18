// Recent destinations list for the Saved tab.
//
// Each row can be promoted to a pinned place: tapping "Pin" reveals an inline
// label field so the rider names the place before it is saved, which keeps the
// pinned list readable ("Home", "Work") instead of full geocoder strings.

import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { palette } from "@/constants/theme";
import type { RecentDestination } from "@/lib/trip-store";

type PinHandler = (recent: RecentDestination, label: string) => void;

function RecentRow({
  recent,
  onPin,
  divider,
}: {
  recent: RecentDestination;
  onPin: PinHandler;
  divider: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState("Favourite");
  const when = new Date(recent.lastUsed).toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        padding: 14,
        borderBottomWidth: divider ? 1 : 0,
        borderBottomColor: palette.line,
      }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            fontFamily: "BricolageGrotesque_700Bold",
            fontSize: 16,
            lineHeight: 20,
            color: palette.ink,
          }}
          numberOfLines={2}
        >
          {recent.name}
        </Text>
        <Text
          style={{
            fontFamily: "Geist_700Bold",
            fontSize: 10,
            letterSpacing: 1.8,
            color: palette.inkSoft,
            textTransform: "uppercase",
            marginTop: 4,
          }}
        >
          {when}
        </Text>
      </View>

      {editing ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <TextInput
            autoFocus
            value={label}
            onChangeText={setLabel}
            placeholder="Home"
            placeholderTextColor="rgba(90,87,78,0.5)"
            style={{
              width: 96,
              backgroundColor: palette.limestoneSoft,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: palette.line,
              paddingHorizontal: 10,
              paddingVertical: 6,
              fontFamily: "Geist_500Medium",
              fontSize: 13,
              color: palette.ink,
            }}
          />
          <Pressable
            onPress={() => {
              onPin(recent, label.trim() || "Favourite");
              setEditing(false);
            }}
            style={({ pressed }) => ({
              backgroundColor: palette.aegeanDeep,
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 999,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text
              style={{
                fontFamily: "Geist_600SemiBold",
                fontSize: 12,
                color: palette.limestone,
              }}
            >
              Save
            </Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          onPress={() => setEditing(true)}
          style={({ pressed }) => ({
            backgroundColor: palette.ink,
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 999,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Text
            style={{
              fontFamily: "Geist_600SemiBold",
              fontSize: 12,
              color: palette.limestone,
            }}
          >
            Pin
          </Text>
        </Pressable>
      )}
    </View>
  );
}

export function RecentDestinations({
  recents,
  onPin,
}: {
  recents: RecentDestination[];
  onPin: PinHandler;
}) {
  if (recents.length === 0) {
    return (
      <View
        style={{
          backgroundColor: palette.white,
          borderRadius: 22,
          borderWidth: 1,
          borderColor: palette.line,
          padding: 18,
        }}
      >
        <Text
          style={{
            fontFamily: "Geist_500Medium",
            fontSize: 13,
            lineHeight: 19,
            color: palette.inkSoft,
          }}
        >
          Your recent destinations will show up here as you plan trips.
        </Text>
      </View>
    );
  }

  return (
    <View
      style={{
        backgroundColor: palette.white,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: palette.line,
        overflow: "hidden",
      }}
    >
      {recents.map((r, i) => (
        <RecentRow
          key={r.id}
          recent={r}
          onPin={onPin}
          divider={i < recents.length - 1}
        />
      ))}
    </View>
  );
}

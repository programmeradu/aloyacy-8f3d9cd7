import type { ReactNode } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { palette } from "@/constants/theme";
import type { PickedPlace } from "@/components/PlacesAutocomplete";
import { planStyles } from "./styles";

function FieldRow({
  icon,
  label,
  value,
  placeholder,
  onPress,
  accessory,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  placeholder?: boolean;
  onPress: () => void;
  accessory?: ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      style={({ pressed }) => [
        planStyles.field,
        pressed && { backgroundColor: palette.limestoneSoft },
      ]}
    >
      <View style={planStyles.fieldIcon}>{icon}</View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={planStyles.fieldLabel}>{label}</Text>
        {/* Long place names wrap onto a second line rather than clipping. */}
        <Text
          style={[planStyles.fieldValue, placeholder && { color: palette.inkSoft }]}
          numberOfLines={2}
        >
          {value}
        </Text>
      </View>
      {accessory ?? (
        <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
          <Path
            d="m9 6 6 6-6 6"
            stroke={palette.inkSoft}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      )}
    </Pressable>
  );
}

/** From / To card with the locate-me shortcut and the swap control. */
export function RouteForm({
  originValue,
  originIsPlaceholder,
  destinationLabel,
  locating,
  locError,
  canSwap,
  onPickOrigin,
  onPickDestination,
  onLocate,
  onSwap,
}: {
  originValue: string;
  originIsPlaceholder: boolean;
  destinationLabel: string | null;
  locating: boolean;
  locError: string | null;
  canSwap: boolean;
  onPickOrigin: () => void;
  onPickDestination: () => void;
  onLocate: () => void;
  onSwap: () => void;
}) {
  return (
    <View style={{ paddingHorizontal: 20, marginTop: 20 }}>
      <View style={planStyles.formCard}>
        <FieldRow
          icon={
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
              <Circle cx={12} cy={12} r={5} fill={palette.aegeanDeep} />
              <Circle
                cx={12}
                cy={12}
                r={10.5}
                stroke={palette.aegeanDeep}
                strokeOpacity={0.35}
                strokeWidth={1.5}
              />
            </Svg>
          }
          label="FROM"
          value={originValue}
          placeholder={originIsPlaceholder}
          onPress={onPickOrigin}
          accessory={
            <Pressable
              onPress={onLocate}
              hitSlop={8}
              disabled={locating}
              accessibilityRole="button"
              accessibilityLabel="Use my current location"
              accessibilityState={{ busy: locating }}
              style={({ pressed }) => [planStyles.locateBtn, pressed && { opacity: 0.7 }]}
            >
              {locating ? (
                <ActivityIndicator size="small" color={palette.limestone} />
              ) : (
                <>
                  <Svg width={12} height={12} viewBox="0 0 24 24" fill="none">
                    <Path
                      d="M12 2v3M12 19v3M2 12h3M19 12h3"
                      stroke={palette.limestone}
                      strokeWidth={2}
                      strokeLinecap="round"
                    />
                    <Circle cx={12} cy={12} r={5} stroke={palette.limestone} strokeWidth={2} />
                    <Circle cx={12} cy={12} r={1.5} fill={palette.limestone} />
                  </Svg>
                  <Text style={planStyles.locateBtnText}>Locate me</Text>
                </>
              )}
            </Pressable>
          }
        />

        <View style={planStyles.divider}>
          <View style={planStyles.dividerLine} />
          <Pressable
            onPress={onSwap}
            disabled={!canSwap}
            hitSlop={8}
            style={({ pressed }) => [
              planStyles.swapBtn,
              !canSwap && { opacity: 0.45 },
              pressed && { opacity: 0.7 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Swap origin and destination"
            accessibilityState={{ disabled: !canSwap }}
          >
            <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
              <Path
                d="M7 4v14m0 0-3-3m3 3 3-3M17 20V6m0 0-3 3m3-3 3 3"
                stroke={palette.ink}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </Pressable>
          <View style={planStyles.dividerLine} />
        </View>

        <FieldRow
          icon={
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
              <Path d="M12 22s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12Z" fill={palette.ochre} />
              <Circle cx={12} cy={10} r={2.4} fill={palette.limestone} />
            </Svg>
          }
          label="TO"
          value={destinationLabel ?? "Where are you heading?"}
          placeholder={!destinationLabel}
          onPress={onPickDestination}
        />
      </View>
      {locError && <Text style={planStyles.locErr}>{locError}</Text>}
    </View>
  );
}

export type { PickedPlace };

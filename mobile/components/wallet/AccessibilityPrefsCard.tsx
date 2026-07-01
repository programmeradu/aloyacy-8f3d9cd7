// Accessibility preferences — step-free routing, prefer-shade, and
// walking-cap stepper. Local-only on mobile (see useAccessibilityPrefs
// note). Editorial ink-on-limestone, minimum-11pt type, 36pt+ taps.

import { View, Text, Pressable, StyleSheet, Switch } from "react-native";
import { palette } from "@/constants/theme";
import { useAccessibilityPrefs } from "@/lib/useAccessibilityPrefs";

const WALK_CAP_STEPS = [400, 600, 800, 1000, 1200, 1500, 2000] as const;

export function AccessibilityPrefsCard() {
  const { prefs, update } = useAccessibilityPrefs();
  const currentCap = prefs.maxWalkMeters;
  const capOn = currentCap != null;
  const capIndex =
    currentCap == null
      ? -1
      : WALK_CAP_STEPS.indexOf(currentCap as (typeof WALK_CAP_STEPS)[number]);

  const decCap = () => {
    if (!capOn) return update({ maxWalkMeters: WALK_CAP_STEPS[WALK_CAP_STEPS.length - 1] });
    if (capIndex > 0) update({ maxWalkMeters: WALK_CAP_STEPS[capIndex - 1] });
  };
  const incCap = () => {
    if (!capOn) return update({ maxWalkMeters: WALK_CAP_STEPS[0] });
    if (capIndex >= 0 && capIndex < WALK_CAP_STEPS.length - 1) {
      update({ maxWalkMeters: WALK_CAP_STEPS[capIndex + 1] });
    }
  };
  const status = prefs.stepFree || prefs.preferShade || capOn ? "ON" : "OFF";

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>ACCESS</Text>
          <Text style={styles.title}>Route preferences</Text>
        </View>
        <Text style={styles.status}>{status}</Text>
      </View>

      <View style={styles.toggleRow}>
        <ToggleRow
          label="Step-free routing"
          checked={prefs.stepFree}
          onChange={(v) => update({ stepFree: v })}
        />
        <ToggleRow
          label="Prefer shaded walks"
          checked={prefs.preferShade}
          onChange={(v) => update({ preferShade: v })}
        />
      </View>

      <View style={styles.capRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.capLabel}>Max walking distance</Text>
          <Pressable
            onPress={() =>
              update({ maxWalkMeters: capOn ? null : WALK_CAP_STEPS[2] })
            }
          >
            <Text style={styles.capToggle}>{capOn ? "TAP TO CLEAR" : "SET LIMIT"}</Text>
          </Pressable>
        </View>
        <View style={styles.stepper}>
          <StepBtn label="−" disabled={capOn && capIndex <= 0} onPress={decCap} />
          <Text style={styles.capValue}>{capOn ? `${currentCap}m` : "—"}</Text>
          <StepBtn
            label="+"
            disabled={capOn && capIndex >= WALK_CAP_STEPS.length - 1}
            onPress={incCap}
          />
        </View>
      </View>
    </View>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.toggle}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Switch
        value={checked}
        onValueChange={onChange}
        thumbColor={palette.limestone}
        trackColor={{ true: palette.ink, false: palette.limestoneSoft }}
      />
    </View>
  );
}

function StepBtn({
  label,
  disabled,
  onPress,
}: {
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[styles.stepBtn, disabled && { opacity: 0.3 }]}
    >
      <Text style={styles.stepBtnLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 14,
    padding: 16,
    borderRadius: 20,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.line,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  eyebrow: {
    fontFamily: "JetBrainsMono_500Medium",
    fontSize: 9,
    letterSpacing: 2,
    color: palette.inkSoft,
  },
  title: {
    marginTop: 2,
    fontFamily: "BricolageGrotesque_700Bold",
    fontSize: 16,
    color: palette.ink,
  },
  status: {
    fontFamily: "JetBrainsMono_500Medium",
    fontSize: 10,
    letterSpacing: 1.8,
    color: palette.inkSoft,
  },
  toggleRow: { marginTop: 12, gap: 4 },
  toggle: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  toggleLabel: {
    fontFamily: "Geist_600SemiBold",
    fontSize: 13,
    color: palette.ink,
  },
  capRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: palette.line,
  },
  capLabel: {
    fontFamily: "Geist_600SemiBold",
    fontSize: 13,
    color: palette.ink,
  },
  capToggle: {
    marginTop: 3,
    fontFamily: "JetBrainsMono_500Medium",
    fontSize: 9,
    letterSpacing: 1.6,
    color: palette.inkSoft,
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  capValue: {
    minWidth: 62,
    textAlign: "center",
    fontFamily: "JetBrainsMono_500Medium",
    fontSize: 13,
    color: palette.ink,
  },
  stepBtn: {
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.limestoneSoft,
    borderWidth: 1,
    borderColor: palette.line,
  },
  stepBtnLabel: {
    fontFamily: "JetBrainsMono_500Medium",
    fontSize: 14,
    color: palette.ink,
  },
});

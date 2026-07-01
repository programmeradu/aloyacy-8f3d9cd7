// Reanimated entrance wrapper — Aloya global polish.
//
// Sections wrapped in <FadeSection> fade + rise 12px on mount with a
// small stagger based on `index`. Honors OS reduce-motion by falling
// back to a plain <View>.
//
// Usage:
//   <FadeSection index={0}>{...}</FadeSection>
//   <FadeSection index={1} delay={80}>{...}</FadeSection>

import { AccessibilityInfo, View, type ViewProps } from "react-native";
import { useEffect, useState } from "react";
import Animated, { FadeInDown } from "react-native-reanimated";

type Props = ViewProps & {
  index?: number;
  delay?: number;
  /** duration in ms; default 420 */
  duration?: number;
};

export function FadeSection({
  index = 0,
  delay,
  duration = 420,
  children,
  style,
  ...rest
}: Props) {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => alive && setReduceMotion(v))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", (v) =>
      setReduceMotion(v),
    );
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  if (reduceMotion) {
    return (
      <View style={style} {...rest}>
        {children}
      </View>
    );
  }

  const computedDelay = delay ?? index * 70;
  return (
    <Animated.View
      entering={FadeInDown.duration(duration).delay(computedDelay).springify().damping(18)}
      style={style}
      {...rest}
    >
      {children}
    </Animated.View>
  );
}

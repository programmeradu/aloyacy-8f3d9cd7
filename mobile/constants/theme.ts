/**
 * Aloya design tokens for non-Tailwind APIs (StatusBar, native components,
 * StyleSheet color props). Keep in sync with mobile/tailwind.config.js and
 * src/styles.css. Light theme only — Wave 1 ships no dark variant.
 */
export const palette = {
  limestone: "#F6F1E7",
  limestoneSoft: "#EDE6D6",
  aegean: "#3F9BB2",
  aegeanSoft: "#D7E8EC",
  aegeanDeep: "#1F6C82",
  ochre: "#C9853A",
  ochreSoft: "#F2DFC4",
  olive: "#3F4A36",
  oliveSoft: "#6A7560",
  ink: "#1F1E18",
  inkSoft: "#5A574E",
  line: "rgba(31,30,24,0.08)",
  white: "#FFFFFF",
} as const;

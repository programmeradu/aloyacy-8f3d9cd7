/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Mirrors src/styles.css (web). Hex equivalents of the oklch tokens
        // so NativeWind utilities resolve to the same brand palette.
        limestone: "#F6F1E7",
        "limestone-soft": "#EDE6D6",
        aegean: "#3F9BB2",
        "aegean-soft": "#D7E8EC",
        "aegean-deep": "#1F6C82",
        ochre: "#C9853A",
        "ochre-soft": "#F2DFC4",
        olive: "#3F4A36",
        "olive-soft": "#6A7560",
        ink: "#1F1E18",
        "ink-soft": "#5A574E",
        line: "rgba(31,30,24,0.08)",
      },
      fontFamily: {
        display: ["BricolageGrotesque_700Bold"],
        "display-bold": ["BricolageGrotesque_800ExtraBold"],
        sans: ["Geist_500Medium"],
        "sans-semi": ["Geist_600SemiBold"],
        "sans-bold": ["Geist_700Bold"],
        mono: ["JetBrainsMono_500Medium"],
      },
    },
  },
  plugins: [],
};

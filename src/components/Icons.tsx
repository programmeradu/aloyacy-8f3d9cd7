// Custom hand-drawn SVG iconography for Aloya.
// No Lucide / generic icon set — each icon is unique to the brand.

type IconProps = { className?: string; strokeWidth?: number };

const base = (className?: string) =>
  `inline-block ${className ?? ""}`;

export const IconCompass = ({ className, strokeWidth = 1.5 }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" className={base(className)} stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <path d="M9 15l2-6 4-2-2 6-4 2z" />
    <circle cx="12" cy="12" r="0.6" fill="currentColor" />
  </svg>
);

export const IconRoute = ({ className, strokeWidth = 1.5 }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" className={base(className)} stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="6" cy="6" r="2.2" />
    <circle cx="18" cy="18" r="2.2" />
    <path d="M6 8.2v4a4 4 0 0 0 4 4h4" />
    <path d="M14 16.2l2 2" strokeOpacity="0" />
  </svg>
);

export const IconOlive = ({ className, strokeWidth = 1.5 }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" className={base(className)} stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3c-3 3-4 6-4 9 0 4 2 7 4 9 2-2 4-5 4-9 0-3-1-6-4-9z" />
    <path d="M12 8v13" />
  </svg>
);

export const IconTicket = ({ className, strokeWidth = 1.5 }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" className={base(className)} stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V8z" />
    <path d="M14 6v12" strokeDasharray="1.5 2.5" />
  </svg>
);

export const IconSearch = ({ className, strokeWidth = 1.5 }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" className={base(className)} stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="6" />
    <path d="m20 20-4.3-4.3" />
  </svg>
);

export const IconArrowUpRight = ({ className, strokeWidth = 1.5 }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" className={base(className)} stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 17 17 7" />
    <path d="M8 7h9v9" />
  </svg>
);

export const IconBus = ({ className, strokeWidth = 1.5 }: IconProps) => (
  // A bespoke "vessel" — bus reimagined as a calm capsule with windows
  <svg viewBox="0 0 24 24" fill="none" className={base(className)} stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 8a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v8a2 2 0 0 1-2 2h-.5l-.5 1.5L15 19h-6l-.5-.5L8 17h-1a2 2 0 0 1-2-2V8z" />
    <path d="M5 12h14" />
    <path d="M9 8h6" />
    <circle cx="9" cy="15" r="0.6" fill="currentColor" />
    <circle cx="15" cy="15" r="0.6" fill="currentColor" />
  </svg>
);

export const IconSun = ({ className, strokeWidth = 1.5 }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" className={base(className)} stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3.5" />
    <path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
  </svg>
);

export const IconClock = ({ className, strokeWidth = 1.5 }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" className={base(className)} stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5V12l3 2" />
  </svg>
);

export const IconWaves = ({ className, strokeWidth = 1.5 }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" className={base(className)} stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 8c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2" />
    <path d="M2 14c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2" />
    <path d="M2 20c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2" />
  </svg>
);

export const IconPin = ({ className, strokeWidth = 1.5 }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" className={base(className)} stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 21s-7-6.5-7-12a7 7 0 1 1 14 0c0 5.5-7 12-7 12z" />
    <circle cx="12" cy="9" r="2.4" />
  </svg>
);

// Bespoke five-point star, thin-line editorial weight. Used as the
// "favourite" glyph in the trip planner.
export const IconStar = ({ className, strokeWidth = 1.5 }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" className={base(className)} stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3.6l2.55 5.17 5.7.83-4.13 4.02.98 5.68L12 16.62l-5.1 2.68.98-5.68L3.75 9.6l5.7-.83L12 3.6z" />
  </svg>
);

// House glyph — pitched roof + door. For "home" labelled saved places.
export const IconHome = ({ className, strokeWidth = 1.5 }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" className={base(className)} stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 10.5L12 4l8 6.5V20a.5.5 0 0 1-.5.5h-5V14h-5v6.5h-5A.5.5 0 0 1 4 20v-9.5z" />
  </svg>
);

// Briefcase glyph for "work" / "office".
export const IconBriefcase = ({ className, strokeWidth = 1.5 }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" className={base(className)} stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <rect x="3.5" y="7.5" width="17" height="12" rx="1.5" />
    <path d="M9 7.5V5.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    <path d="M3.5 12.5h17" />
  </svg>
);

export const IconArrowLeft = ({ className, strokeWidth = 1.5 }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" className={base(className)} stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 6l-6 6 6 6" />
  </svg>
);

export const IconCloud = ({ className, strokeWidth = 1.5 }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" className={base(className)} stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 18a4 4 0 0 1-.5-7.97A6 6 0 0 1 18 11a3.5 3.5 0 0 1 0 7H7z" />
  </svg>
);

export const IconRain = ({ className, strokeWidth = 1.5 }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" className={base(className)} stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 14a4 4 0 0 1-.5-7.97A6 6 0 0 1 18 7a3.5 3.5 0 0 1 0 7H7z" />
    <path d="M9 18l-1 3M13 18l-1 3M17 18l-1 3" />
  </svg>
);

export const IconMoon = ({ className, strokeWidth = 1.5 }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" className={base(className)} stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
  </svg>
);

export const IconWind = ({ className, strokeWidth = 1.5 }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" className={base(className)} stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 8h11a3 3 0 1 0-3-3" />
    <path d="M3 12h16a3 3 0 1 1-3 3" />
    <path d="M3 16h9" />
  </svg>
);

export const IconExpand = ({ className, strokeWidth = 1.5 }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" className={base(className)} stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 9V4h5" />
    <path d="M20 9V4h-5" />
    <path d="M4 15v5h5" />
    <path d="M20 15v5h-5" />
  </svg>
);

export const IconClose = ({ className, strokeWidth = 1.5 }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" className={base(className)} stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 6l12 12" />
    <path d="M18 6L6 18" />
  </svg>
);

export const IconCrosshair = ({ className, strokeWidth = 1.5 }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" className={base(className)} stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="8" />
    <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
    <circle cx="12" cy="12" r="1.5" fill="currentColor" />
  </svg>
);

export const IconArrowUp = ({ className, strokeWidth = 1.75 }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" className={base(className)} stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 19V5" />
    <path d="M5 12l7-7 7 7" />
  </svg>
);

export const IconMic = ({ className, strokeWidth = 1.5 }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" className={base(className)} stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="3" width="6" height="12" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0" />
    <path d="M12 18v3" />
  </svg>
);

export const IconNav = ({ className, strokeWidth = 1.5 }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" className={base(className)} stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 11l18-8-8 18-2-8-8-2z" />
  </svg>
);

export const IconClockSmall = ({ className, strokeWidth = 1.5 }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" className={base(className)} stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

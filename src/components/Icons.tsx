// Custom hand-drawn SVG iconography for Aloya.
// No Lucide / generic icon set — each icon is unique to the brand.

type IconProps = { className?: string; strokeWidth?: number };

const base = (className?: string) =>
  `inline-block ${className ?? ""}`;

export const IconCompass = ({ className, strokeWidth = 1.5 }: IconProps) => (
  // Bespoke "wayfinder": a half-sun rising over a curved horizon — a
  // Mediterranean-coded explore mark. Not the typical compass dial.
  <svg viewBox="0 0 24 24" fill="none" className={base(className)} stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 15.5c2.2-2 5-3 8-3s5.8 1 8 3" />
    <path d="M6.5 15.5a5.5 5.5 0 0 1 11 0" />
    <path d="M12 5.5v2.2" />
    <path d="M6.5 8l1.4 1.6" />
    <path d="M17.5 8l-1.4 1.6" />
    <path d="M3.2 12.6l1.8.4" />
    <path d="M20.8 12.6l-1.8.4" />
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
  // Bespoke "cairn": three stacked Mediterranean stones — a wayside marker
  // for saved places. Unique to Aloya; no generic bookmark/heart/pin.
  <svg viewBox="0 0 24 24" fill="none" className={base(className)} stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 19.5c0-1.2 1.4-2.2 3-2.2s3 1 3 2.2" />
    <ellipse cx="12" cy="15.5" rx="4.6" ry="1.9" />
    <ellipse cx="12" cy="10.5" rx="3.6" ry="1.7" />
    <ellipse cx="12" cy="6" rx="2.4" ry="1.4" />
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

export const IconShare = ({ className, strokeWidth = 1.5 }: IconProps) => (
  // Bespoke share mark: an outbound arc lifting away from a base — an open
  // gesture rather than the generic node-graph share icon.
  <svg viewBox="0 0 24 24" fill="none" className={base(className)} stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 14V4" />
    <path d="M8 8l4-4 4 4" />
    <path d="M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
  </svg>
);

export const IconWhatsApp = ({ className }: IconProps) => (
  // Official WhatsApp brand glyph (Meta brand mark): rounded speech bubble
  // with the canonical receiver curve. Rendered in WhatsApp green when used
  // on a neutral surface — pass a wrapper with its own bg if you need
  // monochrome treatment.
  <svg viewBox="0 0 32 32" className={base(className)} fill="currentColor" aria-hidden="true">
    <path d="M16.003 3.2C8.94 3.2 3.2 8.94 3.2 16c0 2.26.59 4.46 1.71 6.4L3.2 28.8l6.55-1.71a12.77 12.77 0 0 0 6.25 1.6h.01c7.06 0 12.8-5.74 12.8-12.8 0-3.42-1.33-6.63-3.75-9.05a12.71 12.71 0 0 0-9.06-3.64Zm0 23.36h-.01a10.6 10.6 0 0 1-5.4-1.48l-.39-.23-3.88 1.02 1.04-3.78-.25-.39A10.62 10.62 0 0 1 5.36 16C5.36 10.14 10.14 5.36 16 5.36c2.84 0 5.51 1.11 7.52 3.12a10.55 10.55 0 0 1 3.12 7.52c0 5.86-4.78 10.56-10.64 10.56Zm5.83-7.91c-.32-.16-1.89-.93-2.18-1.04-.29-.11-.5-.16-.72.16-.21.32-.82 1.04-1 1.25-.18.21-.37.24-.69.08-.32-.16-1.35-.5-2.57-1.59a9.6 9.6 0 0 1-1.78-2.21c-.18-.32-.02-.49.14-.65.14-.14.32-.37.48-.55.16-.18.21-.32.32-.53.11-.21.05-.4-.03-.56-.08-.16-.72-1.74-.99-2.38-.26-.62-.53-.54-.72-.55l-.61-.01c-.21 0-.56.08-.85.4-.29.32-1.11 1.08-1.11 2.64s1.14 3.06 1.3 3.27c.16.21 2.24 3.42 5.43 4.79.76.33 1.35.52 1.81.67.76.24 1.45.21 2 .13.61-.09 1.89-.77 2.16-1.52.27-.74.27-1.38.19-1.52-.08-.13-.29-.21-.61-.37Z" />
  </svg>
);

export const IconDownload = ({ className, strokeWidth = 1.5 }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" className={base(className)} stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 4v12" />
    <path d="M7 11l5 5 5-5" />
    <path d="M5 20h14" />
  </svg>
);

export const IconLink = ({ className, strokeWidth = 1.5 }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" className={base(className)} stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 1 0-5.7-5.7L11.5 7" />
    <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7L12.5 17" />
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

// ── Filled / duotone variants for active tab-bar states. iOS HIG pattern:
// outline when inactive, filled when active. Outer shape filled with
// currentColor, inner glyph cut with the surface color for contrast.
export const IconCompassFilled = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={base(className)} fill="none">
    <path d="M3.5 16c2.4-2.4 5.3-3.6 8.5-3.6s6.1 1.2 8.5 3.6" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" />
    <path d="M6.5 15.5a5.5 5.5 0 0 1 11 0z" fill="currentColor" />
    <path d="M12 5.2v2.4M6.2 7.8l1.5 1.7M17.8 7.8l-1.5 1.7M2.8 12.4l2 .5M21.2 12.4l-2 .5" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round" />
  </svg>
);


export const IconRouteFilled = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={base(className)} fill="none" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 8.2v4a4 4 0 0 0 4 4h4" />
    <circle cx="6" cy="6" r="2.4" fill="currentColor" />
    <circle cx="18" cy="18" r="2.4" fill="currentColor" />
  </svg>
);

export const IconWavesFilled = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={base(className)} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 8c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2" />
    <path d="M2 14c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2" />
    <path d="M2 20c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2" />
  </svg>
);

export const IconOliveFilled = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={base(className)} fill="currentColor">
    <ellipse cx="12" cy="15.5" rx="4.6" ry="1.9" />
    <ellipse cx="12" cy="10.5" rx="3.6" ry="1.7" />
    <ellipse cx="12" cy="6" rx="2.4" ry="1.4" />
    <path d="M7.4 15.5h9.2M8.4 10.5h7.2M9.6 6h4.8" stroke="var(--color-limestone)" strokeWidth={0.9} strokeLinecap="round" fill="none" opacity="0.5" />
  </svg>
);


export const IconTicketFilled = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={base(className)} fill="currentColor">
    <path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V8z" />
    <path d="M14 6.5v11" stroke="var(--color-limestone)" strokeWidth={1.4} strokeLinecap="round" strokeDasharray="1.5 2.5" fill="none" />
  </svg>
);

export const IconScanCard = ({ className, strokeWidth = 1.5 }: IconProps) => (
  // Bespoke scan mark: viewfinder corner brackets framing a horizontal scan line.
  <svg viewBox="0 0 24 24" fill="none" className={base(className)} stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 8V6a2 2 0 0 1 2-2h2" />
    <path d="M20 8V6a2 2 0 0 0-2-2h-2" />
    <path d="M4 16v2a2 2 0 0 0 2 2h2" />
    <path d="M20 16v2a2 2 0 0 1-2 2h-2" />
    <path d="M5.5 12h13" />
  </svg>
);

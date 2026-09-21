// Solid variants used for active navigation states.

import type { IconProps } from "./icon-kit";
import { iconClass } from "./icon-kit";

export const IconCompassFilled = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={iconClass(className)} fill="none">
    <path
      d="M3.5 16c2.4-2.4 5.3-3.6 8.5-3.6s6.1 1.2 8.5 3.6"
      stroke="currentColor"
      strokeWidth={2.1}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M6.5 15.5a5.5 5.5 0 0 1 11 0z" fill="currentColor" />
    <path
      d="M12 5.2v2.4M6.2 7.8l1.5 1.7M17.8 7.8l-1.5 1.7M2.8 12.4l2 .5M21.2 12.4l-2 .5"
      stroke="currentColor"
      strokeWidth={2.1}
      strokeLinecap="round"
    />
  </svg>
);

export const IconRouteFilled = ({ className }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    className={iconClass(className)}
    fill="none"
    stroke="currentColor"
    strokeWidth={2.1}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M6 8.2v4a4 4 0 0 0 4 4h4" />
    <circle cx="6" cy="6" r="2.4" fill="currentColor" />
    <circle cx="18" cy="18" r="2.4" fill="currentColor" />
  </svg>
);

export const IconWavesFilled = ({ className }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    className={iconClass(className)}
    fill="none"
    stroke="currentColor"
    strokeWidth={2.4}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M2 8c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2" />
    <path d="M2 14c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2" />
    <path d="M2 20c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2" />
  </svg>
);

export const IconOliveFilled = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={iconClass(className)} fill="currentColor">
    <ellipse cx="12" cy="15.5" rx="4.6" ry="1.9" />
    <ellipse cx="12" cy="10.5" rx="3.6" ry="1.7" />
    <ellipse cx="12" cy="6" rx="2.4" ry="1.4" />
    <path
      d="M7.4 15.5h9.2M8.4 10.5h7.2M9.6 6h4.8"
      stroke="var(--color-limestone)"
      strokeWidth={0.9}
      strokeLinecap="round"
      fill="none"
      opacity="0.5"
    />
  </svg>
);

export const IconTicketFilled = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={iconClass(className)} fill="currentColor">
    <path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V8z" />
    <path
      d="M14 6.5v11"
      stroke="var(--color-limestone)"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeDasharray="1.5 2.5"
      fill="none"
    />
  </svg>
);

export const IconScanCard = ({ className, strokeWidth = 1.5 }: IconProps) => (
  // Bespoke scan mark: viewfinder corner brackets framing a horizontal scan line.
  <svg
    viewBox="0 0 24 24"
    fill="none"
    className={iconClass(className)}
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M4 8V6a2 2 0 0 1 2-2h2" />
    <path d="M20 8V6a2 2 0 0 0-2-2h-2" />
    <path d="M4 16v2a2 2 0 0 0 2 2h2" />
    <path d="M20 16v2a2 2 0 0 1-2 2h-2" />
    <path d="M5.5 12h13" />
  </svg>
);

export const IconStarFilled = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={iconClass(className)} fill="currentColor">
    <path d="M12 3.6l2.55 5.17 5.7.83-4.13 4.02.98 5.68L12 16.62l-5.1 2.68.98-5.68L3.75 9.6l5.7-.83L12 3.6z" />
  </svg>
);

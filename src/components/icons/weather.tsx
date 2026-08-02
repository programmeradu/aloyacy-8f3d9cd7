// Weather and sky marks.

import type { IconProps } from "./icon-kit";
import { iconClass } from "./icon-kit";

export const IconCloud = ({ className, strokeWidth = 1.5 }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    className={iconClass(className)}
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M7 18a4 4 0 0 1-.5-7.97A6 6 0 0 1 18 11a3.5 3.5 0 0 1 0 7H7z" />
  </svg>
);

export const IconRain = ({ className, strokeWidth = 1.5 }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    className={iconClass(className)}
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M7 14a4 4 0 0 1-.5-7.97A6 6 0 0 1 18 7a3.5 3.5 0 0 1 0 7H7z" />
    <path d="M9 18l-1 3M13 18l-1 3M17 18l-1 3" />
  </svg>
);

export const IconMoon = ({ className, strokeWidth = 1.5 }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    className={iconClass(className)}
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
  </svg>
);

export const IconWind = ({ className, strokeWidth = 1.5 }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    className={iconClass(className)}
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 8h11a3 3 0 1 0-3-3" />
    <path d="M3 12h16a3 3 0 1 1-3 3" />
    <path d="M3 16h9" />
  </svg>
);

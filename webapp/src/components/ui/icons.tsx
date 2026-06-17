/**
 * Icon set for ActionAmp — thin 1.4-stroke SVGs, 16×16 viewBox.
 * Each takes a className passthrough for sizing/coloring via currentColor.
 *
 * Source: app-shell-whatnow.html prototype nav icons.
 */
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  width: 16,
  height: 16,
  viewBox: "0 0 16 16",
  fill: "none",
  "aria-hidden": true,
} as const;

/* What Now — star (the home / chooser) */
export function StarIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M8 1.5l1.8 4.2 4.5.4-3.4 3 1 4.4L8 11.3 4.1 13.5l1-4.4-3.4-3 4.5-.4z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

/* Inbox — stacked lines */
export function InboxIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M3 4h10M3 8h10M3 12h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/* Today — clock */
export function ClockIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 5v3.5l2 1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/* Upcoming — calendar */
export function CalendarIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <rect x="2.5" y="3.5" width="11" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/* Someday — dashed circle */
export function SomedayIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M2.5 8c0-3 2.5-5.5 5.5-5.5s5.5 2.5 5.5 5.5-2.5 5.5-5.5 5.5-5.5-2.5-5.5-5.5z" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 5v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeDasharray="1 1.5" />
    </svg>
  );
}

/* Projects — folder/cart */
export function ProjectsIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M2 4h3l1.5 8h6L14 6H5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="6.5" cy="13.5" r="1" fill="currentColor" />
      <circle cx="11.5" cy="13.5" r="1" fill="currentColor" />
    </svg>
  );
}

/* Goals — target star */
export function GoalsIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M8 1l2.2 4.5 5 .7-3.6 3.5.85 5L8 12.3 3.55 14.7l.85-5L.8 6.2l5-.7z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

/* Logbook — open books */
export function LogbookIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M2 13.5V4l4-1.5v11M6 8h4M10 13.5V6l4-1.5v9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* User — person */
export function UserIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <circle cx="8" cy="5.5" r="2.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M3 13.5c0-2.5 2.2-4.5 5-4.5s5 2 5 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/* Plus — capture */
export function PlusIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/* Moon — theme (dark) */
export function MoonIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M13 9.2A5 5 0 016.8 3 5.5 5.5 0 1013 9.2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

/* Sun — theme (light) */
export function SunIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M8 2v1.5M8 12.5V14M14 8h-1.5M3.5 8H2M12.2 3.8l-1 1M4.8 11.2l-1 1M12.2 12.2l-1-1M4.8 4.8l-1-1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="8" cy="8" r="2.8" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

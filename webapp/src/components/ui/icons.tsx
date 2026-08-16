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

/* Device icons — compact admin evidence markers. */
export function PhoneIcon(p: IconProps) {
  return <svg {...base} {...p}><rect x="4.5" y="1.5" width="7" height="13" rx="1.4" stroke="currentColor" strokeWidth="1.4" /><path d="M7 12h2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>;
}

export function TabletIcon(p: IconProps) {
  return <svg {...base} {...p}><rect x="3" y="1.5" width="10" height="13" rx="1.4" stroke="currentColor" strokeWidth="1.4" /><circle cx="8" cy="12" r=".7" fill="currentColor" /></svg>;
}

export function DesktopIcon(p: IconProps) {
  return <svg {...base} {...p}><rect x="2" y="2.5" width="12" height="8" rx="1" stroke="currentColor" strokeWidth="1.4" /><path d="M6 13.5h4M8 10.5v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>;
}

/* Search — global retrieval. */
export function SearchIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M10.5 10.5L14 14"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* Next — star (the home / chooser) */
export function StarIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path
        d="M8 1.5l1.8 4.2 4.5.4-3.4 3 1 4.4L8 11.3 4.1 13.5l1-4.4-3.4-3 4.5-.4z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* Inbox — stacked lines */
export function InboxIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path
        d="M3 4h10M3 8h10M3 12h6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* Today — clock */
export function ClockIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M8 5v3.5l2 1"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* Upcoming — calendar */
export function CalendarIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <rect
        x="2.5"
        y="3.5"
        width="11"
        height="10"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M2.5 6.5h11M5.5 2v3M10.5 2v3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* Someday — dashed circle */
export function SomedayIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path
        d="M2.5 8c0-3 2.5-5.5 5.5-5.5s5.5 2.5 5.5 5.5-2.5 5.5-5.5 5.5-5.5-2.5-5.5-5.5z"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M8 5v3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeDasharray="1 1.5"
      />
    </svg>
  );
}

/* Projects — folder/cart */
export function ProjectsIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path
        d="M2 4h3l1.5 8h6L14 6H5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="6.5" cy="13.5" r="1" fill="currentColor" />
      <circle cx="11.5" cy="13.5" r="1" fill="currentColor" />
    </svg>
  );
}

/* Goals — target star */
export function GoalsIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path
        d="M8 1l2.2 4.5 5 .7-3.6 3.5.85 5L8 12.3 3.55 14.7l.85-5L.8 6.2l5-.7z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* Logbook — open books */
export function LogbookIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path
        d="M2 13.5V4l4-1.5v11M6 8h4M10 13.5V6l4-1.5v9"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* User — person */
export function UserIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <circle cx="8" cy="5.5" r="2.5" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M3 13.5c0-2.5 2.2-4.5 5-4.5s5 2 5 4.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* Plus — capture */
export function PlusIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path
        d="M8 3v10M3 8h10"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* Feedback — loudspeaker */
export function LoudspeakerIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path
        d="M2.5 9.5h2.2L9 12.2V3.8L4.7 6.5H2.5z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M11 6.1c.6.5.9 1.2.9 1.9s-.3 1.4-.9 1.9M12.7 4.5c1 .9 1.6 2.1 1.6 3.5s-.6 2.6-1.6 3.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* Delete — trash can (triage "delete" + won't-do surfaces) */
export function TrashIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path
        d="M3 4.5h10M6.5 4.5V3.2h3V4.5M5 4.5l.7 8.2h4.6l.7-8.2"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* Moon — theme (dark) */
export function MoonIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path
        d="M13 9.2A5 5 0 016.8 3 5.5 5.5 0 1013 9.2z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* Sun — theme (light) */
export function SunIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path
        d="M8 2v1.5M8 12.5V14M14 8h-1.5M3.5 8H2M12.2 3.8l-1 1M4.8 11.2l-1 1M12.2 12.2l-1-1M4.8 4.8l-1-1"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <circle cx="8" cy="8" r="2.8" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

/* Arrow right — forward motion (CTAs that advance the user) */
export function ArrowRightIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path
        d="M3 8h9M8.5 4.5L12 8l-3.5 3.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* Hash — tag chip prefix */
export function HashIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path
        d="M3 6h10M3 10h10M6.5 2l-1.5 12M11 2l-1.5 12"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* Box — project chip prefix */
export function BoxIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path
        d="M2 5l6-3 6 3v6l-6 3-6-3V5z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M2 5l6 3 6-3M8 8v6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* Chevron down — signals "this chip opens something". Used by PropertyChips. */
export function ChevronIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path
        d="M4 6l4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* Overflow — vertical ellipsis for ⋯ menus */
export function MoreIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <circle cx="8" cy="3.5" r="1.3" fill="currentColor" />
      <circle cx="8" cy="8" r="1.3" fill="currentColor" />
      <circle cx="8" cy="12.5" r="1.3" fill="currentColor" />
    </svg>
  );
}

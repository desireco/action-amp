/**
 * Tiny inline icons for the task chip editor. Kept here (not in components/ui)
 * because they're specific to the chip affordance — a 1.4-stroke chevron that
 * signals "this chip opens something."
 */
export function TaskChevronIcon() {
  return (
    <svg
      className="aa-task-chip-chev"
      width="11"
      height="11"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
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

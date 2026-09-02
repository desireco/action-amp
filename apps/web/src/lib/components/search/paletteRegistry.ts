/** Ported verbatim from webapp/src/search/paletteRegistry.ts (S9).
 *  One typed registry keeps command labels, aliases, and routes in sync.
 *  Simple lists are Projects — they surface as project search results, not
 *  as a shell command. */
export type PaletteCommandDefinition = {
  id: string;
  title: string;
  subtitle: string;
  aliases: string[];
  href?: string;
  action?: "capture" | "theme" | "shortcuts";
  common?: boolean;
};

export const PALETTE_COMMANDS: readonly PaletteCommandDefinition[] = [
  {
    id: "next",
    title: "Next",
    subtitle: "Open view",
    aliases: ["home", "do", "what now"],
    href: "/do",
    common: true,
  },
  {
    id: "capture",
    title: "Capture a thought",
    subtitle: "New inbox note",
    aliases: ["add", "new", "inbox"],
    action: "capture",
    common: true,
  },
  {
    id: "inbox",
    title: "Inbox",
    subtitle: "Open view",
    aliases: ["capture", "notes"],
    href: "/do/inbox",
    common: true,
  },
  {
    id: "today",
    title: "Today",
    subtitle: "Open view",
    aliases: ["tasks", "now"],
    href: "/do/today",
    common: true,
  },
  {
    id: "projects",
    title: "Projects",
    subtitle: "Open view",
    aliases: ["plan", "lists", "checklist"],
    href: "/do/projects",
    common: true,
  },
  {
    id: "goals",
    title: "Goals",
    subtitle: "Open view",
    aliases: ["outcomes", "plan"],
    href: "/do/goals",
    common: true,
  },
  {
    id: "triage",
    title: "Triage",
    subtitle: "Review inbox",
    aliases: ["process", "dispatch"],
    href: "/do/inbox/review",
  },
  {
    id: "upcoming",
    title: "Upcoming",
    subtitle: "Open view",
    aliases: ["later", "plan"],
    href: "/do/upcoming",
  },
  {
    id: "someday",
    title: "Someday",
    subtitle: "Open view",
    aliases: ["maybe", "later"],
    href: "/do/someday",
  },
  {
    id: "logbook",
    title: "Logbook",
    subtitle: "Open view",
    aliases: ["archive", "done", "history"],
    href: "/do/logbook",
  },
  {
    id: "review",
    title: "Review",
    subtitle: "Open view",
    aliases: ["weekly", "monthly", "reflect"],
    href: "/do/review",
  },
  {
    id: "settings",
    title: "Settings",
    subtitle: "Open view",
    aliases: ["preferences", "account"],
    href: "/do/settings",
  },
  {
    id: "billing",
    title: "Billing",
    subtitle: "Manage plan",
    aliases: ["pro", "upgrade", "payment"],
    href: "/do/settings/billing",
  },
  {
    id: "theme",
    title: "Toggle theme",
    subtitle: "Appearance",
    aliases: ["dark", "light", "mode"],
    action: "theme",
  },
  {
    id: "shortcuts",
    title: "Shortcut help",
    subtitle: "Keyboard reference",
    aliases: ["help", "keys", "commands"],
    action: "shortcuts",
  },
] as const;

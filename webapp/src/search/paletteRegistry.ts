export type PaletteCommandDefinition = {
  id: string;
  title: string;
  subtitle: string;
  aliases: string[];
  href?: string;
  action?: "capture" | "theme" | "shortcuts";
  common?: boolean;
  lensTypes?: readonly ("LIFE_AREA" | "SIMPLE_LIST")[];
};

/** One typed registry keeps command labels, aliases, and routes in sync. */
export const PALETTE_COMMANDS: readonly PaletteCommandDefinition[] = [
  {
    id: "next",
    title: "Next",
    subtitle: "Open view",
    aliases: ["home", "do", "what now"],
    href: "/app",
    common: true,
    lensTypes: ["LIFE_AREA"],
  },
  {
    id: "capture",
    title: "Capture a thought",
    subtitle: "New inbox note",
    aliases: ["add", "new", "inbox"],
    action: "capture",
    common: true,
    lensTypes: ["LIFE_AREA", "SIMPLE_LIST"],
  },
  {
    id: "inbox",
    title: "Inbox",
    subtitle: "Open view",
    aliases: ["capture", "notes"],
    href: "/app/inbox",
    common: true,
    lensTypes: ["LIFE_AREA", "SIMPLE_LIST"],
  },
  {
    id: "today",
    title: "Today",
    subtitle: "Open view",
    aliases: ["tasks", "now"],
    href: "/app/today",
    common: true,
    lensTypes: ["LIFE_AREA"],
  },
  {
    id: "projects",
    title: "Projects",
    subtitle: "Open view",
    aliases: ["plan"],
    href: "/app/projects",
    common: true,
    lensTypes: ["LIFE_AREA"],
  },
  {
    id: "goals",
    title: "Goals",
    subtitle: "Open view",
    aliases: ["outcomes", "plan"],
    href: "/app/goals",
    common: true,
    lensTypes: ["LIFE_AREA"],
  },
  {
    id: "triage",
    title: "Triage",
    subtitle: "Review inbox",
    aliases: ["process", "dispatch"],
    href: "/app/inbox/review",
    lensTypes: ["LIFE_AREA", "SIMPLE_LIST"],
  },
  {
    id: "upcoming",
    title: "Upcoming",
    subtitle: "Open view",
    aliases: ["later", "plan"],
    href: "/app/upcoming",
    lensTypes: ["LIFE_AREA"],
  },
  {
    id: "someday",
    title: "Someday",
    subtitle: "Open view",
    aliases: ["maybe", "later"],
    href: "/app/someday",
    lensTypes: ["LIFE_AREA"],
  },
  {
    id: "logbook",
    title: "Logbook",
    subtitle: "Open view",
    aliases: ["archive", "done", "history"],
    href: "/app/logbook",
    lensTypes: ["LIFE_AREA"],
  },
  {
    id: "review",
    title: "Review",
    subtitle: "Open view",
    aliases: ["weekly", "monthly", "reflect"],
    href: "/app/review",
    lensTypes: ["LIFE_AREA"],
  },
  {
    id: "list",
    title: "List",
    subtitle: "Open checklist",
    aliases: ["simple list", "checklist"],
    href: "/app/list",
    common: true,
    lensTypes: ["SIMPLE_LIST"],
  },
  {
    id: "settings",
    title: "Settings",
    subtitle: "Open view",
    aliases: ["preferences", "account"],
    href: "/app/settings",
  },
  {
    id: "billing",
    title: "Billing",
    subtitle: "Manage plan",
    aliases: ["pro", "upgrade", "payment"],
    href: "/app/settings/billing",
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

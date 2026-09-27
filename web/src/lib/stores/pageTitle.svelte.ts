/** Context-aware browser tab titles ("Buy groceries · ActionAmp").
 *
 *  Single writer: the root layout's $effect applies computeTitle() — the only
 *  place document.title is set. Sources are (a) route-derived section names,
 *  (b) entity names read from the stores (whatNow picked/focused, projects/
 *  goals detail), and (c) an override slot below for detail pages whose entity
 *  lives in local component state (/tasks/:permalink, SIMPLE_LIST
 *  /projects/:permalink). The override is keyed by route id + permalink so a
 *  stale entry can never title the wrong page; consumers match on the live
 *  page params before using it. */

export interface TitleOverride {
  routeId: string;
  permalink: string;
  text: string;
}

/** Structural views of the store rows the title derives from — the real
 *  store types (WhatNowTask, FocusedTask, ProjectDetail, GoalDetail)
 *  satisfy these without casts. */
export interface TitleSources {
  topTask: { description: string } | null;
  picked: { description: string } | null;
  focused: { description: string } | null;
  projectDetail: { permalink: string; name: string } | null;
  goalDetail: { permalink: string; name: string } | null;
}

export interface TitlePage {
  pathname: string;
  routeId: string | null;
  params: Record<string, string | undefined>;
  error: unknown;
  status: number;
}

const BRAND = "ActionAmp";

/** Static sections, most specific first; prefix entries end with "/". */
const STATIC_SECTIONS: [path: string, label: string][] = [
  ["/inbox/review", "Triage"],
  ["/inbox", "Inbox"],
  ["/today", "Today"],
  ["/upcoming", "Upcoming"],
  ["/week", "Week"],
  ["/someday", "Someday"],
  ["/logbook", "Logbook"],
  ["/rituals", "Rituals"],
  ["/projects", "Projects"],
  ["/goals", "Goals"],
  ["/settings/", "Settings"],
  ["/settings", "Settings"],
  ["/admin/", "Admin"],
  ["/admin", "Admin"],
  ["/login", "Sign in"],
  ["/signup", "Create account"],
  ["/welcome", "Welcome"],
  ["/share", "Shared link"],
  ["/cli/", "CLI sign-in"],
  ["/cli", "CLI sign-in"],
  ["/founding-100", "Founding 100"],
];

function overrideFor(
  override: TitleOverride | null,
  routeId: string,
  permalink: string | undefined,
): string | null {
  if (override && override.routeId === routeId && permalink && override.permalink === permalink) {
    return override.text;
  }
  return null;
}

/** The one title computation. Pure: the layout effect feeds it the reactive
 *  `page` object, the override slot, and the store rows, then applies the
 *  result to document.title. */
export function computeTitle(
  page: TitlePage,
  override: TitleOverride | null,
  src: TitleSources,
): string {
  const context = titleContext(page, override, src);
  return context ? `${context} · ${BRAND}` : BRAND;
}

function titleContext(
  page: TitlePage,
  override: TitleOverride | null,
  src: TitleSources,
): string | null {
  // The error boundary keeps its calm card titles (moved here from
  // +error.svelte so the single-writer rule holds).
  if (page.error) {
    return page.status === 404 ? "Page not found" : "Something went wrong";
  }

  // Entity pages, keyed by route id so params are type-honest.
  switch (page.routeId) {
    case "/next": {
      // The What Now stage card — the task on the table right now.
      return src.topTask?.description ?? "Next";
    }
    case "/today/[permalink]": {
      return src.picked?.description ?? "Today";
    }
    case "/focus": {
      return src.focused?.description ?? "Focus";
    }
    case "/tasks/[permalink]": {
      return (
        overrideFor(override, page.routeId, page.params.permalink) ?? "Task"
      );
    }
    case "/projects/[permalink]": {
      const detail = src.projectDetail;
      if (detail && detail.permalink === page.params.permalink) return detail.name;
      return overrideFor(override, page.routeId, page.params.permalink) ?? "Project";
    }
    case "/goals/[permalink]": {
      const detail = src.goalDetail;
      if (detail && detail.permalink === page.params.permalink) return detail.name;
      return "Goal";
    }
  }

  for (const [path, label] of STATIC_SECTIONS) {
    if (page.pathname === path) return label;
  }
  for (const [path, label] of STATIC_SECTIONS) {
    if (path.endsWith("/") && page.pathname.startsWith(path)) return label;
  }
  return null;
}

class PageTitleStore {
  /** The locally-held entity name a detail page published, if any. */
  override = $state<TitleOverride | null>(null);

  set(routeId: string, permalink: string, text: string) {
    this.override = { routeId, permalink, text };
  }

  /** Clear only if the slot is still ours — effect cleanup ordering must not
   *  clobber a successor page's entry. */
  clearIf(routeId: string, permalink: string) {
    const current = this.override;
    if (
      current &&
      current.routeId === routeId &&
      current.permalink === permalink
    ) {
      this.override = null;
    }
  }
}

export const pageTitle = new PageTitleStore();

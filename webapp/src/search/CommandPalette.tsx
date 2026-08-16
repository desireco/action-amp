import { useEffect, useMemo, useRef, useState } from "react";
import {
  getCommandPaletteIndex,
  searchSite,
  useQuery,
} from "wasp/client/operations";
import { CloseButton, ProGate, SearchIcon } from "../components/ui";
import { SITEWIDE_SEARCH_MESSAGE } from "../billing/entitlements";
import type {
  CommandIndexItem,
  SearchResultKind,
  SearchSiteResult,
} from "./operationsCore";
import {
  matchPaletteEntries,
  type SearchablePaletteEntry,
} from "./paletteMatching";
import { PALETTE_COMMANDS } from "./paletteRegistry";
import "./CommandPalette.css";

export type CommandPaletteMode = "search" | "command";

interface PaletteLens {
  id: string;
  name: string;
  color: string | null;
}

interface PaletteCommand {
  id: string;
  title: string;
  subtitle: string;
  aliases: string[];
  kindOrder: number;
  run: () => void;
}

type PaletteItem =
  | { type: "result"; id: string; result: SearchSiteResult }
  | { type: "command"; id: string; command: PaletteCommand };

const KIND_ORDER: Record<SearchResultKind | "lens" | "command", number> = {
  command: 0,
  task: 1,
  project: 2,
  goal: 3,
  resource: 4,
  inbox: 5,
  lens: 6,
};

/**
 * Injectable operations — the test seam (see CommandPalette.test.tsx).
 * Production renders pass nothing (real Wasp hooks); tests inject fakes
 * instead of module-mocking wasp/client/operations.
 */
export interface CommandPaletteDeps {
  useQuery: typeof useQuery;
  searchSite: typeof searchSite;
  getCommandPaletteIndex: typeof getCommandPaletteIndex;
}

export function CommandPalette({
  mode,
  entitled,
  lenses,
  onClose,
  onNavigate,
  onSwitchLens,
  onCapture,
  onToggleTheme,
  onOpenShortcuts,
  activeLensType = "LIFE_AREA",
  deps,
}: {
  mode: CommandPaletteMode;
  entitled: boolean;
  lenses: PaletteLens[];
  onClose: () => void;
  onNavigate: (href: string) => void;
  onSwitchLens: (id: string) => void;
  onCapture: () => void;
  onToggleTheme: () => void;
  onOpenShortcuts: () => void;
  activeLensType?: "LIFE_AREA" | "SIMPLE_LIST";
  /** Test seam — defaults to the real Wasp operations. */
  deps?: Partial<CommandPaletteDeps>;
}) {
  const runQuery = deps?.useQuery ?? useQuery;
  const runSearch = deps?.searchSite ?? searchSite;
  const runIndex = deps?.getCommandPaletteIndex ?? getCommandPaletteIndex;
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const normalized = query.trim().replace(/\s+/g, " ");
  const canSearch =
    entitled && normalized.length >= 2 && normalized.length <= 100;

  useEffect(() => {
    previouslyFocused.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    inputRef.current?.focus();
    return () => previouslyFocused.current?.focus();
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedQuery(normalized), 200);
    return () => window.clearTimeout(timeout);
  }, [normalized]);

  const { data, error, isFetching } = runQuery(
    runSearch,
    { query: debouncedQuery },
    { enabled: canSearch && debouncedQuery === normalized },
  );
  const { data: indexData, isFetching: indexFetching } = runQuery(
    runIndex,
    undefined,
    { enabled: entitled && mode === "command" },
  );
  const currentData =
    data?.query === normalized && debouncedQuery === normalized ? data : null;

  const commands = useMemo<PaletteCommand[]>(
    () =>
      PALETTE_COMMANDS.filter(
        (definition) =>
          !definition.lensTypes ||
          definition.lensTypes.includes(activeLensType),
      ).map((definition) => ({
        id: `command-${definition.id}`,
        title: definition.title,
        subtitle: definition.subtitle,
        aliases: [...definition.aliases],
        kindOrder: KIND_ORDER.command,
        run: () => {
          if (definition.href) onNavigate(definition.href);
          else if (definition.action === "capture") onCapture();
          else if (definition.action === "theme") onToggleTheme();
          else if (definition.action === "shortcuts") onOpenShortcuts();
        },
      })),
    [activeLensType, onCapture, onNavigate, onOpenShortcuts, onToggleTheme],
  );

  const indexedCommands = useMemo<PaletteCommand[]>(() => {
    const byId = new Map<string, CommandIndexItem>();
    for (const lens of lenses) {
      byId.set(`lens-${lens.id}`, {
        id: lens.id,
        kind: "lens",
        title: lens.name,
        subtitle: "Switch lens",
        href: null,
        aliases: ["lens", "switch context"],
      });
    }
    for (const item of indexData?.items ?? []) {
      byId.set(`${item.kind}-${item.id}`, item);
    }
    return [...byId.values()].map((item) => ({
      id: `entity-${item.kind}-${item.id}`,
      title: item.title,
      subtitle: [kindLabel(item.kind), item.subtitle]
        .filter(Boolean)
        .join(" · "),
      aliases: item.aliases,
      kindOrder: KIND_ORDER[item.kind],
      run: () => {
        if (item.kind === "lens") onSwitchLens(item.id);
        else if (item.href) onNavigate(item.href);
      },
    }));
  }, [indexData, lenses, onNavigate, onSwitchLens]);

  const showCommands = mode === "command" && normalized.length === 0;
  const items = useMemo<PaletteItem[]>(() => {
    if (showCommands) {
      const commonIds = new Set(
        PALETTE_COMMANDS.filter(
          (definition) =>
            definition.common &&
            (!definition.lensTypes ||
              definition.lensTypes.includes(activeLensType)),
        ).map((definition) => `command-${definition.id}`),
      );
      return commands
        .filter((command) => commonIds.has(command.id))
        .slice(0, 6)
        .map((command) => ({ type: "command", id: command.id, command }));
    }
    if (!normalized) return [];

    const entries = new Map<string, SearchablePaletteEntry<PaletteItem>>();
    if (mode === "command") {
      for (const command of [...commands, ...indexedCommands]) {
        const item: PaletteItem = {
          type: "command",
          id: command.id,
          command,
        };
        entries.set(command.id, {
          id: command.id,
          title: command.title,
          subtitle: command.subtitle,
          aliases: command.aliases,
          kindOrder: command.kindOrder,
          serverResult: false,
          payload: item,
        });
      }
    }
    for (const result of currentData?.results ?? []) {
      const id = `entity-${result.kind}-${result.id}`;
      const indexed = entries.get(id);
      const item: PaletteItem = { type: "result", id, result };
      entries.set(id, {
        id,
        title: result.title,
        subtitle: [result.lens?.name, result.subtitle]
          .filter(Boolean)
          .join(" "),
        aliases: indexed?.aliases ?? [result.kind],
        kindOrder: KIND_ORDER[result.kind],
        serverResult: true,
        payload: item,
      });
    }
    return matchPaletteEntries([...entries.values()], normalized).map(
      (entry) => entry.payload,
    );
  }, [
    activeLensType,
    commands,
    currentData,
    indexedCommands,
    mode,
    normalized,
    showCommands,
  ]);

  useEffect(() => setSelectedId(null), [query]);
  useEffect(() => {
    if (items.length === 0) setSelectedId(null);
    else if (!selectedId || !items.some((item) => item.id === selectedId)) {
      setSelectedId(items[0].id);
    }
  }, [items, selectedId]);
  useEffect(() => {
    if (!selectedId) return;
    const option = document.getElementById(`aa-palette-option-${selectedId}`);
    if (option && cardRef.current?.contains(option)) {
      option.scrollIntoView?.({ block: "nearest" });
    }
  }, [selectedId]);

  const selected = Math.max(
    0,
    items.findIndex((item) => item.id === selectedId),
  );

  function runItem(item: PaletteItem | undefined) {
    if (!item) return;
    onClose();
    if (item.type === "command") item.command.run();
    else onNavigate(item.result.href);
  }

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (items.length > 0)
        setSelectedId(items[(selected + 1) % items.length].id);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (items.length > 0)
        setSelectedId(items[(selected - 1 + items.length) % items.length].id);
    } else if (event.key === "Enter") {
      event.preventDefault();
      runItem(items[selected]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
  }

  function trapTab(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      cardRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const waitingForDebounce = canSearch && debouncedQuery !== normalized;
  const loading =
    canSearch &&
    (waitingForDebounce || isFetching || (mode === "command" && indexFetching));
  const searched = canSearch && debouncedQuery === normalized && !isFetching;
  const activeId = items[selected]
    ? `aa-palette-option-${items[selected].id}`
    : undefined;

  return (
    <div
      className="aa-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="aa-palette-title"
      aria-describedby="aa-palette-description"
      onClick={onClose}
      onKeyDown={trapTab}
    >
      <div
        ref={cardRef}
        className="aa-overlay-card aa-command-palette"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="aa-command-palette__header">
          <SearchIcon className="aa-command-palette__search-icon" />
          <div className="aa-command-palette__input-wrap">
            <h2 id="aa-palette-title" className="aa-command-palette__sr-only">
              {mode === "search" ? "Search ActionAmp" : "Command palette"}
            </h2>
            <p
              id="aa-palette-description"
              className="aa-command-palette__sr-only"
            >
              Search tasks, projects, goals, resources, inbox notes, and
              commands.
            </p>
            <input
              ref={inputRef}
              className="aa-command-palette__input"
              value={query}
              onChange={(event) => setQuery(event.target.value.slice(0, 100))}
              onKeyDown={handleInputKeyDown}
              placeholder={
                mode === "search"
                  ? "Search anything…"
                  : "Find anything or run a command…"
              }
              role="combobox"
              aria-label="Search ActionAmp"
              aria-expanded={items.length > 0}
              aria-controls="aa-command-palette-results"
              aria-activedescendant={activeId}
              aria-autocomplete="list"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <CloseButton
            onClose={onClose}
            label="Close search"
            title="Close (Esc)"
          />
        </header>

        {!entitled ? (
          <div className="aa-command-palette__gate" onClick={onClose}>
            <ProGate
              feature={SITEWIDE_SEARCH_MESSAGE.feature}
              reason={SITEWIDE_SEARCH_MESSAGE.reason}
            />
          </div>
        ) : (
          <div
            id="aa-command-palette-results"
            className="aa-command-palette__results"
            role="listbox"
          >
            {showCommands ? (
              <PaletteGroup label="Commands">
                <PaletteRows
                  items={items}
                  query={normalized}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  onRun={runItem}
                />
                <p className="aa-command-palette__guidance">
                  Type to find anything.
                </p>
              </PaletteGroup>
            ) : normalized.length === 0 ? (
              <PaletteMessage>
                Search tasks, projects, goals, resources, and inbox.
              </PaletteMessage>
            ) : normalized.length === 1 && items.length === 0 ? (
              <PaletteMessage>
                Type one more character to search.
              </PaletteMessage>
            ) : error && items.length === 0 ? (
              <PaletteMessage error>
                {typeof navigator !== "undefined" && !navigator.onLine
                  ? "Search unavailable while offline."
                  : "Search unavailable. Try again."}
              </PaletteMessage>
            ) : loading && items.length === 0 ? (
              <PaletteMessage>Searching…</PaletteMessage>
            ) : searched && items.length === 0 ? (
              <PaletteMessage>No matches for “{normalized}”.</PaletteMessage>
            ) : (
              <PaletteGroup label="Matches">
                <PaletteRows
                  items={items}
                  query={normalized}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  onRun={runItem}
                />
              </PaletteGroup>
            )}
          </div>
        )}

        <footer className="aa-command-palette__footer">
          <span>↑↓ move</span>
          <span>↵ open</span>
          <span>esc close</span>
          <span className="aa-command-palette__count">
            {currentData?.truncated
              ? "More matches—refine your search"
              : searched
                ? `${items.length} results`
                : loading && items.length > 0
                  ? "Searching…"
                  : ""}
          </span>
        </footer>
        <span className="aa-command-palette__sr-only" aria-live="polite">
          {currentData?.truncated
            ? "More matches. Refine your search."
            : searched
              ? `${items.length} results`
              : ""}
        </span>
      </div>
    </div>
  );
}

function PaletteRows({
  items,
  query,
  selectedId,
  onSelect,
  onRun,
}: {
  items: PaletteItem[];
  query: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRun: (item: PaletteItem) => void;
}) {
  return items.map((item) =>
    item.type === "command" ? (
      <CommandRow
        key={item.id}
        command={item.command}
        selected={item.id === selectedId}
        optionId={`aa-palette-option-${item.id}`}
        onHover={() => onSelect(item.id)}
        onRun={() => onRun(item)}
      />
    ) : (
      <ResultRow
        key={item.id}
        result={item.result}
        query={query}
        selected={item.id === selectedId}
        optionId={`aa-palette-option-${item.id}`}
        onHover={() => onSelect(item.id)}
        onRun={() => onRun(item)}
      />
    ),
  );
}

function PaletteGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="aa-command-palette__group" aria-label={label}>
      <h3 className="aa-command-palette__group-title">{label}</h3>
      {children}
    </section>
  );
}

function PaletteMessage({
  children,
  error = false,
}: {
  children: React.ReactNode;
  error?: boolean;
}) {
  return (
    <p className={`aa-command-palette__message${error ? " is-error" : ""}`}>
      {children}
    </p>
  );
}

function CommandRow({
  command,
  selected,
  optionId,
  onHover,
  onRun,
}: {
  command: PaletteCommand;
  selected: boolean;
  optionId: string;
  onHover: () => void;
  onRun: () => void;
}) {
  return (
    <button
      id={optionId}
      type="button"
      role="option"
      aria-selected={selected}
      className={`aa-command-palette__row${selected ? " is-selected" : ""}`}
      onPointerMove={onHover}
      onClick={onRun}
    >
      <span className="aa-command-palette__row-main">
        <span className="aa-command-palette__row-title">{command.title}</span>
        <span className="aa-command-palette__row-subtitle">
          {command.subtitle}
        </span>
      </span>
      <span className="aa-command-palette__enter" aria-hidden="true">
        ↵
      </span>
    </button>
  );
}

function ResultRow({
  result,
  query,
  selected,
  optionId,
  onHover,
  onRun,
}: {
  result: SearchSiteResult;
  query: string;
  selected: boolean;
  optionId: string;
  onHover: () => void;
  onRun: () => void;
}) {
  const meta = [
    kindLabel(result.kind),
    result.lens?.name,
    result.subtitle,
    stateLabel(result.state),
  ].filter(Boolean);
  return (
    <button
      id={optionId}
      type="button"
      role="option"
      aria-selected={selected}
      className={`aa-command-palette__row aa-command-palette__row--result${selected ? " is-selected" : ""}`}
      onPointerMove={onHover}
      onClick={onRun}
    >
      <span className="aa-command-palette__row-main">
        <span className="aa-command-palette__row-heading">
          <span className="aa-command-palette__row-title">
            <Highlight value={result.title} query={query} />
          </span>
          <span className="aa-command-palette__row-meta">
            {meta.join(" · ")}
          </span>
        </span>
        {result.snippet && (
          <span className="aa-command-palette__snippet">
            <Highlight value={result.snippet} query={query} />
          </span>
        )}
      </span>
      <span className="aa-command-palette__matched">
        {matchedFieldLabel(result.matchedField)}
      </span>
    </button>
  );
}

function kindLabel(kind: SearchResultKind | "lens"): string {
  return {
    task: "Task",
    project: "Project",
    goal: "Goal",
    resource: "Resource",
    inbox: "Inbox record",
    lens: "Lens",
  }[kind];
}

function Highlight({ value, query }: { value: string; query: string }) {
  const tokens = query.split(/\s+/).filter(Boolean).map(escapeRegExp);
  if (tokens.length === 0) return value;
  const pattern = new RegExp(`(${tokens.join("|")})`, "gi");
  return value
    .split(pattern)
    .map((part, index) =>
      tokens.some((token) => new RegExp(`^${token}$`, "i").test(part)) ? (
        <mark key={index}>{part}</mark>
      ) : (
        part
      ),
    );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stateLabel(state: SearchSiteResult["state"]): string {
  return {
    active: "Active",
    today: "Today",
    upcoming: "Upcoming",
    someday: "Someday",
    done: "Done",
    "wont-do": "Won't do",
    inbox: "Inbox",
    archived: "Archived",
  }[state];
}

function matchedFieldLabel(field: SearchSiteResult["matchedField"]): string {
  return {
    title: "title",
    body: "notes",
    outcome: "outcome",
    note: "update",
    url: "link",
  }[field];
}

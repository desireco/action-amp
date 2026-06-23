import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router";
import { useQuery } from "wasp/client/operations";
import { getInboxItems, triageInboxItem } from "wasp/client/operations";
import { useQueryClient } from "@tanstack/react-query";
import { DispatchButton, TriageCard, Button, Chip, BottomSheet, ResourcePickerSheet, type TriageExit } from "../components/ui";
import { useActiveLens } from "./lensContext";
import { getProjects } from "wasp/client/operations";
import { getGoals } from "wasp/client/operations";
import "./InboxTriagePage.css";

/**
 * Inbox Triage — the Tinder-style walkthrough. One item at a time.
 *
 * Each dispatch calls `triageInboxItem`, which transforms the InboxItem into
 * its concrete type (Task / Project / Resource) and deletes the original. The
 * Dispatch transforms each InboxItem into its concrete type and deletes the
 * original. The exit animation direction encodes the decision.
 * From triage-tinder.html.
 */

type Action = "task-today" | "project" | "resource" | "upcoming" | "someday" | "trash";

// Each action maps to an exit direction (the animation encodes the decision).
const ACTION_EXIT: Record<Action, TriageExit> = {
  "task-today": "right",
  project: "up",
  resource: "left",
  upcoming: "right",
  someday: "left",
  trash: "down",
};

export function InboxTriagePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const lens = useActiveLens();
  const { data: items } = useQuery(getInboxItems);
  const list = items ?? [];

  const [idx, setIdx] = useState(0);
  const [exit, setExit] = useState<TriageExit>(null);
  const [dispatched, setDispatched] = useState(false);
  const [entering, setEntering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resourcePickerOpen, setResourcePickerOpen] = useState(false);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  // Last-used project for the P key (file-in-project), per lens. Persists across
  // sessions so P becomes a fast, predictable file action. Defaults to the
  // "General" project seeded by ensureOnboarded.
  const [lastProjectId, setLastProjectId] = useState<string | null>(null);

  // Projects are needed for both the Resource picker AND the P-key target, so
  // load them unconditionally (was: gated on resourcePickerOpen).
  const { data: projects } = useQuery(
    getProjects,
    lens ? { lensId: lens.id } : undefined,
    { enabled: !!lens },
  );
  // Resolve lastProjectId on lens change: stored value, else default to General.
  useEffect(() => {
    if (!lens) return;
    const stored = localStorage.getItem(`aa-triage-project:${lens.id}`);
    if (stored) {
      setLastProjectId(stored);
    } else {
      const general = (projects ?? []).find((p) => p.name === "General");
      setLastProjectId(general?.id ?? null);
    }
  }, [lens, projects]);
  const targetName =
    (projects ?? []).find((p) => p.id === lastProjectId)?.name ?? "project";

  const rememberProject = (id: string) => {
    setLastProjectId(id);
    if (lens) localStorage.setItem(`aa-triage-project:${lens.id}`, id);
  };

  // Lazy-load goals for the resource picker (only fetched when it opens).
  const { data: pickerGoals } = useQuery(
    getGoals,
    lens ? { lensId: lens.id } : undefined,
    { enabled: !!lens && resourcePickerOpen },
  );

  // Snapshot the list on first arrival. The triage walkthrough navigates this
  // FIXED snapshot, not the refetching query — without it, invalidating
  // getInboxItems after each dispatch shrinks `list`, shifting indices (skipping
  // items) and tripping isComplete early. The live query still updates the
  // sidebar count; the walkthrough just doesn't chase it.
  const [snapshot, setSnapshot] = useState<typeof list | null>(null);
  useEffect(() => {
    if (!snapshot && list.length > 0) setSnapshot(list);
  }, [list, snapshot]);
  const triageList = snapshot ?? list;

  const total = triageList.length;
  const done = idx;
  const isComplete = idx >= total;

  const dispatch = useCallback(
    async (action: Action, extra?: { goalId?: string; projectId?: string }) => {
      if (idx >= total || exit || !lens) return; // ignore mid-animation / no lens
      const item = triageList[idx];
      setDispatched(true);
      setExit(ACTION_EXIT[action]);
      try {
        await triageInboxItem({
          inboxItemId: item.id,
          decision: action,
          lensId: lens.id,
          goalId: extra?.goalId,
          projectId: extra?.projectId,
        });
        queryClient.invalidateQueries({ queryKey: ["getInboxItems"] });
        queryClient.invalidateQueries({ queryKey: ["getTasks"] });
        queryClient.invalidateQueries({ queryKey: ["getProjects"] });
        queryClient.invalidateQueries({ queryKey: ["getAppData"] });
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Triage failed.");
      }
      setTimeout(() => setDispatched(false), 200);
      setTimeout(() => {
        setExit(null);
        setEntering(true);
        setIdx((i) => i + 1);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => setEntering(false));
        });
      }, 320);
    },
    [idx, total, exit, lens, triageList, queryClient],
  );

  // Current item — declared before the keyboard effect (Shift+P needs it) and
  // reused in the render. Null when the loop is complete.
  const item = triageList[idx] ?? null;

  // Keyboard shortcuts (scoped to this page)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isComplete) return;
      const meta = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      // Cmd/Ctrl+P → open the project picker (change the P-key target).
      if (meta && k === "p") {
        e.preventDefault();
        setProjectPickerOpen(true);
        return;
      }
      const map: Record<string, Action> = {
        "1": "task-today",
        "2": "upcoming",
        "3": "someday",
        delete: "trash",
        backspace: "trash",
      };
      if (k === "p") {
        // Shift+P → leave triage, create a new Project from this item (Q2).
        if (e.shiftKey) {
          e.preventDefault();
          navigate("/app/projects", { state: { fromInboxItemId: item.id, initialName: item.text } });
          return;
        }
        // P → file current item into the last-used project (default General).
        // No target yet → open the picker instead of filing standalone.
        e.preventDefault();
        if (lastProjectId) dispatch("someday", { projectId: lastProjectId });
        else setProjectPickerOpen(true);
      } else if (e.key === "Enter") {
        // Enter → the no-horizon default: a standalone Task (Someday).
        e.preventDefault();
        dispatch("someday");
      } else if (map[e.key] || map[k]) {
        e.preventDefault();
        dispatch(map[e.key] || map[k]);
      } else if (e.key === "Escape") {
        navigate("/app/inbox");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dispatch, isComplete, navigate, lastProjectId, item]);

  const reset = () => {
    setIdx(0);
    setExit(null);
    setDispatched(false);
    setEntering(false);
    setError(null);
  };
  void reset; // (kept for the 'Triage again' action when the loop reopens)

  if (isComplete) {
    return (
      <div className="aa-triage-empty">
        <div className="aa-triage-empty__circle" aria-hidden="true">
          <svg viewBox="0 0 16 16" fill="none">
            <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h2 className="aa-triage-empty__title">Inbox zero.</h2>
        <p className="aa-triage-empty__text">Nothing left to decide. Go do something.</p>
        <div className="aa-triage-empty__actions">
          <Button variant="primary" onClick={() => navigate("/app")}>Done →</Button>
          <Button variant="secondary" onClick={() => navigate("/app/inbox")}>Back to inbox</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="aa-triage">
      {/* ---- Top: close + progress ---- */}
      <div className="aa-triage__top">
        <button
          type="button"
          className="aa-triage__close"
          onClick={() => navigate("/app/inbox")}
          title="Done triaging (Esc)"
          aria-label="Close"
        >
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
        <div className="aa-triage__progress">
          <span className="aa-triage__progress-count">
            <b>{done + 1}</b> of <b>{total}</b>
          </span>
          <div className="aa-triage__progress-bar">
            <div
              className="aa-triage__progress-fill"
              style={{ width: `${(done / total) * 100}%` }}
            />
          </div>
        </div>
        <span className="aa-triage__top-spacer" />
      </div>

      <div className="aa-triage__title">
        <h1>What is this?</h1>
        <p>Decide what each thing becomes. It leaves the inbox for good.</p>
      </div>

      {error && (
        <div className="aa-triage__error">
          <Chip variant="rose" small>!</Chip>
          <span>{error}</span>
        </div>
      )}

      {/* ---- Card stage ---- */}
      <div className="aa-triage__stage">
        <TriageCard
          key={item.id}
          body={item.text}
          meta={`captured ${formatAgo(item.createdAt)}`}
          exit={exit}
          dispatched={dispatched}
          entering={entering}
        />

        {/* ---- Dispatch actions ---- */}
        <div className="aa-triage__dispatch">
          <DispatchButton
            tone="teal"
            label="Task"
            sub="just a task — no time commitment yet"
            kbd="↵"
            icon={
              <svg viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
                <path d="M8 5v3.5l2 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            }
            onClick={() => dispatch("someday")}
          />
          <DispatchButton
            tone="violet"
            label={`File in ${targetName}`}
            sub="a step in existing work — click to change"
            kbd="P"
            icon={
              <svg viewBox="0 0 16 16" fill="none">
                <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
                <path d="M2 6h12" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            }
            onClick={() => setProjectPickerOpen(true)}
          />
          <DispatchButton
            tone="amber"
            label="Resource"
            sub="reference — link or note, filed under a project or goal"
            kbd="R"
            icon={
              <svg viewBox="0 0 16 16" fill="none">
                <path d="M3.5 13.5V3.5a1 1 0 011-1h5.5L13 5.5v8a1 1 0 01-1 1H4.5a1 1 0 01-1-1z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                <path d="M9.5 2.5V6h3.5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              </svg>
            }
            onClick={() => setResourcePickerOpen(true)}
          />
        </div>

        <div className="aa-triage__dispatch-secondary">
          <DispatchButton mini kbd="1" label="Today" onClick={() => dispatch("task-today")} />
          <DispatchButton mini kbd="2" label="Upcoming" onClick={() => dispatch("upcoming")} />
          <DispatchButton mini danger kbd="Del" label="Trash" onClick={() => dispatch("trash")} />
        </div>
      </div>

      {/* ---- Resource parent picker (opens when Resource is clicked) ---- */}
      {resourcePickerOpen && item && (
        <ResourcePickerSheet
          resourceTitle={item.text}
          projects={(projects ?? []).map((p) => ({ id: p.id, name: p.name, goalName: p.goal?.name ?? null }))}
          goals={(pickerGoals ?? []).map((g) => ({ id: g.id, name: g.name }))}
          onPick={(parent) => dispatch("resource", parent)}
          onClose={() => setResourcePickerOpen(false)}
        />
      )}

      {/* ---- Project picker (P-key target / click on project) ----
           Pick files the current item into the chosen project as a SOMEDAY task
           and remembers it as the P-key target. */}
      {projectPickerOpen && item && (
        <BottomSheet
          title={`File “${item.text.slice(0, 40)}${item.text.length > 40 ? "…" : ""}” in`}
          onClose={() => setProjectPickerOpen(false)}
        >
          <ul className="aa-triage__picker-list">
            {(projects ?? []).map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className={`aa-triage__picker-item ${p.id === lastProjectId ? "current" : ""}`}
                  onClick={() => {
                    rememberProject(p.id);
                    setProjectPickerOpen(false);
                    void dispatch("someday", { projectId: p.id });
                  }}
                >
                  <span className="aa-triage__picker-name">{p.name}</span>
                  {p.goal && <span className="aa-triage__picker-goal">{p.goal.name}</span>}
                </button>
              </li>
            ))}
          </ul>
        </BottomSheet>
      )}
    </div>
  );
}

function formatAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hr ago`;
  return `${Math.floor(seconds / 86400)} days ago`;
}

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
  const [goalPickerOpen, setGoalPickerOpen] = useState(false);
  // Last-used project / goal for the P / G quick-file keys, per lens. Persists
  // across sessions. lastProjectId defaults to the "General" project seeded
  // by ensureOnboarded; lastGoalId defaults to null (no goal is seeded).
  const [lastProjectId, setLastProjectId] = useState<string | null>(null);
  const [lastGoalId, setLastGoalId] = useState<string | null>(null);

  // Projects + goals feed the pickers AND the P/G quick-file targets, so both
  // load unconditionally (scoped to the active lens).
  const { data: projects } = useQuery(
    getProjects,
    lens ? { lensId: lens.id } : undefined,
    { enabled: !!lens },
  );
  const { data: goals } = useQuery(
    getGoals,
    lens ? { lensId: lens.id } : undefined,
    { enabled: !!lens },
  );

  // Resolve last-used ids on lens change: stored value, else the default.
  useEffect(() => {
    if (!lens) return;
    const storedProject = localStorage.getItem(`aa-triage-project:${lens.id}`);
    setLastProjectId(
      storedProject ??
        (projects ?? []).find((p) => p.name === "General")?.id ??
        null,
    );
    setLastGoalId(localStorage.getItem(`aa-triage-goal:${lens.id}`));
  }, [lens, projects]);
  const targetName =
    (projects ?? []).find((p) => p.id === lastProjectId)?.name ?? "project";
  const targetGoalName =
    (goals ?? []).find((g) => g.id === lastGoalId)?.name ?? "goal";

  const rememberProject = (id: string) => {
    setLastProjectId(id);
    if (lens) localStorage.setItem(`aa-triage-project:${lens.id}`, id);
  };
  const rememberGoal = (id: string) => {
    setLastGoalId(id);
    if (lens) localStorage.setItem(`aa-triage-goal:${lens.id}`, id);
  };

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
  // Truncated text for picker titles.
  const shortText = item
    ? item.text.length > 40
      ? item.text.slice(0, 40) + "…"
      : item.text
    : "";

  // Keyboard shortcuts (scoped to this page)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isComplete || !item) return;

      // ---- Modal: a picker is open. Number keys select rows; Esc closes.
      //           Everything else is swallowed so a stray Enter/t/u doesn't dispatch
      //      while the user is choosing where to file. ----
      if (projectPickerOpen || goalPickerOpen) {
        if (/^[1-9]$/.test(e.key)) {
          e.preventDefault();
          const n = parseInt(e.key, 10) - 1; // ponytail: 1–9 only; >9 items need a scroll+click.
          if (projectPickerOpen) {
            const list = projects ?? [];
            if (n < list.length) {
              rememberProject(list[n].id);
              setProjectPickerOpen(false);
              void dispatch("someday", { projectId: list[n].id });
            } else if (n === list.length) {
              // Last row = create a new project from this item.
              setProjectPickerOpen(false);
              navigate("/app/projects", {
                state: { fromInboxItemId: item.id, initialName: item.text },
              });
            }
          } else {
            const list = goals ?? [];
            if (n < list.length) {
              rememberGoal(list[n].id);
              setGoalPickerOpen(false);
              void dispatch("someday", { goalId: list[n].id });
            }
          }
        }
        return;
      }

      // ---- Top-level dispatch (standard: letters = file actions,
      //      Shift+letter = open list, Enter = no-horizon default) ----
      const k = e.key.toLowerCase();
      if (e.key === "Enter") {
        e.preventDefault();
        dispatch("someday");
      } else if (k === "t") {
        e.preventDefault();
        dispatch("task-today");
      } else if (k === "u") {
        e.preventDefault();
        dispatch("upcoming");
      } else if (e.shiftKey && k === "p") {
        e.preventDefault();
        setProjectPickerOpen(true);
      } else if (e.shiftKey && k === "g") {
        e.preventDefault();
        setGoalPickerOpen(true);
      } else if (k === "p") {
        e.preventDefault();
        if (lastProjectId) dispatch("someday", { projectId: lastProjectId });
        else setProjectPickerOpen(true);
      } else if (k === "g") {
        e.preventDefault();
        if (lastGoalId) dispatch("someday", { goalId: lastGoalId });
        else setGoalPickerOpen(true);
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        dispatch("trash");
      } else if (e.key === "Escape") {
        navigate("/app/inbox");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dispatch, isComplete, navigate, item, projects, goals, lastProjectId, lastGoalId, projectPickerOpen, goalPickerOpen]);

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
            sub="a step in existing work — click to choose"
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
            label={`File in ${targetGoalName}`}
            sub="supports a bigger goal — click to choose"
            kbd="G"
            icon={
              <svg viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
                <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.5" />
                <circle cx="8" cy="8" r="0.5" fill="currentColor" />
              </svg>
            }
            onClick={() => setGoalPickerOpen(true)}
          />
        </div>

        <div className="aa-triage__dispatch-secondary">
          <DispatchButton mini kbd="T" label="Today" onClick={() => dispatch("task-today")} />
          <DispatchButton mini kbd="U" label="Upcoming" onClick={() => dispatch("upcoming")} />
          <DispatchButton mini kbd="R" label="Resource" onClick={() => setResourcePickerOpen(true)} />
          <DispatchButton mini danger kbd="Del" label="Trash" onClick={() => dispatch("trash")} />
        </div>
      </div>

      {/* ---- Resource parent picker (opens when Resource is clicked) ---- */}
      {resourcePickerOpen && item && (
        <ResourcePickerSheet
          resourceTitle={item.text}
          projects={(projects ?? []).map((p) => ({ id: p.id, name: p.name, goalName: p.goal?.name ?? null }))}
          goals={(goals ?? []).map((g) => ({ id: g.id, name: g.name }))}
          onPick={(parent) => dispatch("resource", parent)}
          onClose={() => setResourcePickerOpen(false)}
        />
      )}

      {/* ---- Project picker (P-key target / click on project) ----
           Pick files the current item into the chosen project as a SOMEDAY task
           and remembers it as the P-key target. */}
      {projectPickerOpen && item && (
        <BottomSheet
          title={`File “${shortText}” in`}
          onClose={() => setProjectPickerOpen(false)}
        >
          <ul className="aa-triage__picker-list">
            {(projects ?? []).map((p, i) => (
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
                  <span className="aa-triage__picker-num">{i + 1}</span>
                  <span className="aa-triage__picker-name">{p.name}</span>
                  {p.goal && <span className="aa-triage__picker-goal">{p.goal.name}</span>}
                </button>
              </li>
            ))}
            {/* Last row: create a new project from this item (navigate to the
                create flow; the inbox item is converted on submit). */}
            <li>
              <button
                type="button"
                className="aa-triage__picker-item aa-triage__picker-item--create"
                onClick={() => {
                  setProjectPickerOpen(false);
                  navigate("/app/projects", { state: { fromInboxItemId: item.id, initialName: item.text } });
                }}
              >
                <span className="aa-triage__picker-num">{(projects ?? []).length + 1}</span>
                <span className="aa-triage__picker-name">Create new project</span>
              </button>
            </li>
          </ul>
        </BottomSheet>
      )}

      {/* ---- Goal picker (G-key target / click on goal) ----
           Pick files the current item as a SOMEDAY task linked to the chosen
           goal, and remembers it as the G-key target. No "create" row — goals
           aren't a triage outcome; create them on the Goals page. */}
      {goalPickerOpen && item && (
        <BottomSheet
          title={`File “${shortText}” under goal`}
          onClose={() => setGoalPickerOpen(false)}
        >
          {(goals ?? []).length === 0 ? (
            <p className="aa-triage__picker-empty">No goals yet — create one on the Goals page.</p>
          ) : (
            <ul className="aa-triage__picker-list">
              {(goals ?? []).map((g, i) => (
                <li key={g.id}>
                  <button
                    type="button"
                    className={`aa-triage__picker-item ${g.id === lastGoalId ? "current" : ""}`}
                    onClick={() => {
                      rememberGoal(g.id);
                      setGoalPickerOpen(false);
                      void dispatch("someday", { goalId: g.id });
                    }}
                  >
                    <span className="aa-triage__picker-num">{i + 1}</span>
                    <span className="aa-triage__picker-name">{g.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
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

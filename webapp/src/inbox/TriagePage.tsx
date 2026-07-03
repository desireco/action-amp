import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useQuery } from "wasp/client/operations";
import { getInboxItems, triageInboxItem } from "wasp/client/operations";
import { getAppData } from "wasp/client/operations";
import { useQueryClient } from "@tanstack/react-query";
import { TriageCard, Button, BottomSheet, type TriageExit, type TriageChip } from "../components/ui";
import { useActiveLens } from "../app/lensContext";
import { getProjects } from "wasp/client/operations";
import { getGoals } from "wasp/client/operations";
import type { ParsedPriority, ParsedSize } from "./parseCapture";
import "./TriagePage.css";

/**
 * Triage — define each captured thing, one at a time.
 *
 * Triage is NOT speed-dispatch; it's the deliberate act of *specifying* a task.
 * So the review is a per-item wizard with explicit Continue steps and a final
 * Complete that commits the spec:
 *
 *   1. Context (Lens)  — radio, pre-filled with the active lens, user confirms.
 *   2. Type            — what does this become? Task (default) · Project ·
 *                        Resource (a Note) · Archive.
 *   3. Spec            — inline-expanding property rows (When / Size / Priority
 *                        / Project / Goal for a Task), value-tinted.
 *   4. Complete        — commits the spec; gated until lens + filing target
 *                        (for Task/Resource) are set.
 *
 * Each Complete calls `triageInboxItem` (transforms the InboxItem into its
 * concrete type, deletes the original) and the exit direction encodes the call.
 * Canonical layout: docs/mockups/triage-coauthor.html.
 */

// The committed outcome — maps to triageInboxItem's `decision` union.
type Outcome = "task-today" | "upcoming" | "someday" | "project" | "resource" | "archive";

const OUTCOME_EXIT: Record<Outcome, TriageExit> = {
  "task-today": "right",
  upcoming: "right",
  someday: "left",
  project: "up",
  resource: "left",
  archive: "down",
};

// The type the user picks at step 2. Resource = a Note; Goal is intentionally
// absent — goals are filed *into*, never created at triage (TRIAGE.md §9.3).
type ChosenType = "task" | "project" | "resource" | "archive";

type Step = "lens" | "type" | "spec";

// ---- Options for the inline-expanding spec rows ----
const WHEN_OPTS = ["Today", "Upcoming", "Someday"] as const;
const SIZE_OPTS: ParsedSize[] = ["S", "M", "L", "XL"];
const PRIORITY_OPTS: ParsedPriority[] = ["LOW", "NORMAL", "IMPORTANT"];
const KIND_OPTS = ["Link", "Note"] as const;
const DUE_OPTS = ["—", "This week", "Next week", "Next month"] as const;

// The working spec — everything the user has decided about the current item.
// Mirrors the mockup's `working` object; one shape, fields used per type.
interface Working {
  type: ChosenType;
  // Task
  when: (typeof WHEN_OPTS)[number];
  size: ParsedSize;
  priority: ParsedPriority;
  projectId: string | null; // null = "General"
  goalId: string | null; // links the task to a goal (optional)
  // Project
  projectGoalId: string | null; // goal the new project supports
  due: (typeof DUE_OPTS)[number];
  // Resource (Note)
  parentProjectId: string | null;
  parentGoalId: string | null;
  kind: (typeof KIND_OPTS)[number];
}

export function TriagePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const activeLens = useActiveLens();
  const { data: items } = useQuery(getInboxItems);
  const list = items ?? [];

  // Seed position from `?i=N` (e.g. an inbox row click) once on first arrival.
  // The walkthrough then owns advancement; we don't track the live param. Read
  // as a plain value (not reactively) so completing an item doesn't yank the
  // index when the URL still holds the stale N.
  const startIdx = (() => {
    const n = Number(searchParams.get("i"));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  })();

  // The lens list for step 1's radio. Pulled from the shell's app-data query
  // (same source as the sidebar switch) so the radio shows every lens.
  const { data: appData } = useQuery(getAppData, { lensName: activeLens?.name });
  const lenses = appData?.lenses ?? [];

  const [idx, setIdx] = useState(startIdx);
  const [exit, setExit] = useState<TriageExit>(null);
  const [dispatched, setDispatched] = useState(false);
  const [entering, setEntering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---- Wizard state ----
  const [step, setStep] = useState<Step>("lens");
  // The lens the user confirmed at step 1. Pre-filled with the active lens so
  // the radio isn't blank, but the user must press Continue to ratify it.
  const [chosenLensId, setChosenLensId] = useState<string | null>(null);
  const [working, setWorking] = useState<Working | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null); // expanded spec row

  // Pickers for Project (file-into) / Goal (link) — reuse the bottom-sheet UI.
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [goalPickerOpen, setGoalPickerOpen] = useState(false);
  const [parentProjectPickerOpen, setParentProjectPickerOpen] = useState(false);
  const [parentGoalPickerOpen, setParentGoalPickerOpen] = useState(false);

  // Projects + goals scoped to the *confirmed* lens (step 1 output), not the
  // active one — filing targets must match where the item is actually landing.
  const scopedLensId = chosenLensId ?? activeLens?.id ?? null;
  const { data: projects } = useQuery(
    getProjects,
    scopedLensId ? { lensId: scopedLensId } : undefined,
    { enabled: !!scopedLensId },
  );
  const { data: goals } = useQuery(
    getGoals,
    scopedLensId ? { lensId: scopedLensId } : undefined,
    { enabled: !!scopedLensId },
  );

  // Snapshot the list on first arrival. The triage walkthrough navigates this
  // FIXED snapshot, not the refetching query — without it, invalidating
  // getInboxItems after each Complete shrinks `list`, shifting indices
  // (skipping items) and tripping isComplete early. The live query still
  // updates the sidebar count; the walkthrough just doesn't chase it.
  const [snapshot, setSnapshot] = useState<typeof list | null>(null);
  useEffect(() => {
    if (!snapshot && list.length > 0) setSnapshot(list);
  }, [list, snapshot]);
  const triageList = snapshot ?? list;

  const total = triageList.length;
  // Clamp the start to the live list: a stale `?i` (manual URL, or a list that
  // shrank between the inbox render and arrival) must never point past the end.
  const start = Math.min(startIdx, total);
  // Progress is session-relative: when arrived via a row click (?i=N), the
  // walkthrough reviews from N to the end. Counting from `start` keeps the
  // "n of m" label and bar honest — it reflects what YOU triaged this session,
  // not items above N you never touched.
  const remaining = Math.max(0, total - start);
  const done = idx - start;
  const isComplete = idx >= total;

  const item = triageList[idx] ?? null;
  const shortText = item
    ? item.text.length > 40
      ? item.text.slice(0, 40) + "…"
      : item.text
    : "";

  // Parsed-token chips shown on the card so the user sees what they captured
  // (the stored text is token-stripped, so without these the `@today`/`#mvp`
  // context is invisible during triage). Mirrors InboxPage's chip rendering,
  // mapped onto TriageCard's three tones (date / priority / tag).
  const triageChips: TriageChip[] = useMemo(() => {
    if (!item) return [];
    const chips: TriageChip[] = [];
    if (item.parsedDate) chips.push({ tone: "date", label: `📅 ${formatChipDate(item.parsedDate)}` });
    if (item.parsedProject) chips.push({ tone: "tag", label: `▣ ${item.parsedProject}` });
    if (item.parsedPriority === "IMPORTANT") chips.push({ tone: "priority", label: "★ Important" });
    if (item.parsedPriority === "LOW") chips.push({ tone: "priority", label: "low" });
    if (item.parsedSize) chips.push({ tone: "tag", label: item.parsedSize });
    for (const t of item.parsedTags) chips.push({ tone: "tag", label: t });
    return chips;
  }, [item]);

  // Resolve a `#project` capture token to an actual project in the confirmed
  // lens — case-insensitive name match. Link-only: if there's no match (typo, or
  // the project lives in another lens), the task lands in General and the user
  // picks manually. No auto-create, so a typo never spawns a stray project.
  // (Declared after `item`/`projects` — both are read here.)
  const resolvedProjectId = useMemo(() => {
    const hint = item?.parsedProject;
    if (!hint) return null;
    const match = (projects ?? []).find((p) => p.name.toLowerCase() === hint);
    return match?.id ?? null;
  }, [item?.parsedProject, projects]);

  // ---- Initialize a fresh working spec for a new item ----
  // Precedence on the property defaults: capture-parser token > app default.
  // (When/Size/Priority reflect what the user typed at capture, if anything.)
  const initWorking = useCallback(
    (): Working => ({
      type: "task",
      // Default When = Upcoming (decided 2026-06-25). A triaged task is
      // actionable — it lands on the Upcoming bench (reachable from Today's
      // "See upcoming" and /app/upcoming), not buried in Someday. Today stays
      // un-cluttered EXCEPT when the user said so explicitly at capture: an
      // `today`/`tonight` token is intent, not a default, so it pre-fills Today
      // (the "no auto-Today by default" principle still holds for everything else).
      when: item?.parsedDate && isSameDay(item.parsedDate, new Date()) ? "Today" : "Upcoming",
      size: item?.parsedSize ?? "M",
      priority: item?.parsedPriority ?? "NORMAL",
      projectId: null,
      goalId: null,
      projectGoalId: null,
      due: "—",
      parentProjectId: null,
      parentGoalId: null,
      kind: "Link",
    }),
    [item],
  );

  // Reset the wizard for the current item whenever the index advances.
  useEffect(() => {
    if (!item) return;
    setStep("lens");
    setChosenLensId(activeLens?.id ?? null);
    setWorking(initWorking());
    setOpenKey(null);
  }, [idx, item, activeLens?.id, initWorking]);

  // ---- Derive the committed outcome from the working spec ----
  // `decision` is what triageInboxItem expects; we build it from When (Task) or
  // the chosen type otherwise.
  const buildOutcome = (w: Working): Outcome => {
    if (w.type === "archive") return "archive";
    if (w.type === "project") return "project";
    if (w.type === "resource") return "resource";
    return w.when === "Today" ? "task-today" : w.when === "Upcoming" ? "upcoming" : "someday";
  };

  // ---- Gate: is Complete allowed for the current working spec? ----
  // Lens is always set by step 1. Tasks need a filing target only if the user
  // switched When away from the default? No — a Task with no project is "General",
  // which is valid. So Task is always completable from the spec step. Resources
  // require a parent (project or goal). Projects need nothing beyond the name.
  const canComplete = (w: Working | null): boolean => {
    if (!w || !chosenLensId) return false;
    if (w.type === "resource") return !!w.parentProjectId || !!w.parentGoalId;
    return true;
  };

  const dispatch = useCallback(async () => {
    if (idx >= total || exit || !activeLens || !working || !chosenLensId) return;
    const w = working;
    const outcome = buildOutcome(w);
    setDispatched(true);
    setExit(OUTCOME_EXIT[outcome]);
    try {
      await triageInboxItem({
        inboxItemId: item.id,
        decision: outcome,
        lensId: chosenLensId,
        projectId:
          w.type === "task"
            ? w.projectId ?? resolvedProjectId ?? undefined
            : w.type === "resource"
              ? w.parentProjectId ?? undefined
              : undefined,
        goalId:
          w.type === "task"
            ? w.goalId ?? undefined
            : w.type === "project"
              ? w.projectGoalId ?? undefined
              : w.parentGoalId ?? undefined,
        priority: w.type === "task" ? w.priority : undefined,
        size: w.type === "task" ? w.size : undefined,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, total, exit, activeLens, working, chosenLensId, item, queryClient, resolvedProjectId]);

  // ---- Keyboard (step-aware; no one-key dispatch) ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isComplete || !item) return;

      // A spec row is expanded, or a picker is open — let it handle keys.
      if (openKey || projectPickerOpen || goalPickerOpen || parentProjectPickerOpen || parentGoalPickerOpen) {
        if (e.key === "Escape") {
          setOpenKey(null);
        }
        return;
      }

      if (e.key === "Escape") {
        // Back a step; at the first step, bail to the inbox.
        if (step === "lens") navigate("/app/inbox");
        else setStep(step === "spec" ? "type" : "lens");
        return;
      }

      if (e.key !== "Enter") return;

      // Enter = advance / commit. Disabled while editing the title (contenteditable).
      const editingTitle =
        document.activeElement?.getAttribute("contenteditable") === "true";
      if (editingTitle) return;

      e.preventDefault();
      if (step === "lens" && chosenLensId) {
        setStep("type");
      } else if (step === "type" && working) {
        if (working.type === "archive") {
          void dispatch();
        } else {
          setStep("spec");
        }
      } else if (step === "spec" && canComplete(working)) {
        void dispatch();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    isComplete,
    item,
    step,
    chosenLensId,
    working,
    dispatch,
    navigate,
    openKey,
    projectPickerOpen,
    goalPickerOpen,
    parentProjectPickerOpen,
    parentGoalPickerOpen,
  ]);

  if (isComplete) {
    // Started mid-list (?i>0): items above the start index are still
    // untriaged, so "Inbox zero" would be a lie. Say what's actually true.
    const reachedFromTop = start === 0;
    return (
      <div className="aa-triage-empty">
        <div className="aa-triage-empty__circle" aria-hidden="true">
          <svg viewBox="0 0 16 16" fill="none">
            <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h2 className="aa-triage-empty__title">
          {reachedFromTop ? "Inbox zero." : "Caught up from here."}
        </h2>
        <p className="aa-triage-empty__text">
          {reachedFromTop
            ? "Nothing left to decide. Go do something."
            : `${start} earlier ${start === 1 ? "item is" : "items are"} still in the inbox.`}
        </p>
        <div className="aa-triage-empty__actions">
          {reachedFromTop ? (
            <Button variant="primary" onClick={() => navigate("/app")}>Done →</Button>
          ) : (
            <Button variant="primary" onClick={() => navigate("/app/inbox/review")}>
              Triage earlier →
            </Button>
          )}
          <Button variant="secondary" onClick={() => navigate("/app/inbox")}>Back to inbox</Button>
        </div>
      </div>
    );
  }

  // ---- Helpers for the spec rows ----
  const setW = (patch: Partial<Working>) => setWorking((w) => (w ? { ...w, ...patch } : w));

  // Effective project = manual picker choice > resolved #token link. Drives both
  // the SpecRow display and what dispatch sends; a manual pick always wins.
  const effectiveProjectId = working?.projectId ?? resolvedProjectId ?? null;
  const projectName =
    (projects ?? []).find((p) => p.id === effectiveProjectId)?.name ?? null;
  const goalName =
    (goals ?? []).find((g) => g.id === working?.goalId)?.name ?? null;
  const parentName = working
    ? working.parentProjectId
      ? (projects ?? []).find((p) => p.id === working.parentProjectId)?.name ?? null
      : working.parentGoalId
        ? (goals ?? []).find((g) => g.id === working.parentGoalId)?.name ?? null
        : null
    : null;

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
            <b>{done + 1}</b> of <b>{remaining}</b>
          </span>
          <div className="aa-triage__progress-bar">
            <div
              className="aa-triage__progress-fill"
              style={{ width: `${remaining > 0 ? (done / remaining) * 100 : 0}%` }}
            />
          </div>
        </div>
        <span className="aa-triage__top-spacer" />
      </div>

      <div className="aa-triage__title">
        <h1>Triage</h1>
        <p>Define each thing. It leaves the inbox for good once it's specified.</p>
      </div>

      {error && (
        <div className="aa-triage__error">
          <span>{error}</span>
        </div>
      )}

      {/* ---- Card stage ---- */}
      <div className="aa-triage__stage">
        {item && working && (
          <TriageCard
            key={item.id}
            body={item.text}
            meta={`captured ${formatAgo(item.createdAt)}`}
            chips={triageChips}
            exit={exit}
            dispatched={dispatched}
            entering={entering}
          >
            {/* ============ STEP 1: Context (Lens) ============ */}
            {step === "lens" && (
              <div className="aa-triage-step">
                <div className="aa-triage-step__label">1 · Context</div>
                <p className="aa-triage-step__q">Which life does this belong to?</p>
                <div className="aa-triage-radio" role="radiogroup" aria-label="Lens">
                  {(lenses.length > 0
                    ? lenses
                    : [
                        { id: "Work", name: "Work", color: "indigo" },
                        { id: "Me", name: "Me", color: "emerald" },
                      ]
                  ).map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      role="radio"
                      aria-checked={chosenLensId === l.id}
                      data-lens-color={l.color ?? undefined}
                      className={`aa-triage-radio__opt ${chosenLensId === l.id ? "active" : ""}`}
                      onClick={() => setChosenLensId(l.id)}
                    >
                      <span className="aa-triage-radio__dot" aria-hidden="true" />
                      {l.name}
                    </button>
                  ))}
                </div>
                <Button
                  variant="primary"
                  className="aa-triage-step__continue"
                  disabled={!chosenLensId}
                  onClick={() => setStep("type")}
                >
                  Continue
                </Button>
              </div>
            )}

            {/* ============ STEP 2: Type ============ */}
            {step === "type" && (
              <div className="aa-triage-step">
                <div className="aa-triage-step__label">2 · What does this become?</div>
                <div className="aa-triage-types">
                  {([
                    ["task", "Task", "an action — something to do"],
                    ["project", "Project", "an outcome needing more than one step"],
                    ["resource", "Note", "reference material — not an action"],
                    ["archive", "Archive", "I will not do now — keep it for later"],
                  ] as const)
                    // A captured `#project` token means this is a task *in* that
                    // project — it can't itself be a new project. Hide that option.
                    .filter(([t]) => !(t === "project" && item.parsedProject))
                    .map(([t, label, sub]) => (
                    <button
                      key={t}
                      type="button"
                      className={`aa-triage-type ${working.type === t ? "active" : ""}`}
                      onClick={() => setW({ type: t })}
                    >
                      <span className="aa-triage-type__label">{label}</span>
                      <span className="aa-triage-type__sub">{sub}</span>
                    </button>
                  ))}
                </div>
                <Button
                  variant="primary"
                  className="aa-triage-step__continue"
                  onClick={() => (working.type === "archive" ? void dispatch() : setStep("spec"))}
                >
                  {working.type === "archive" ? "Archive" : "Continue"}
                </Button>
              </div>
            )}

            {/* ============ STEP 3: Spec ============ */}
            {step === "spec" && (
              <div className="aa-triage-step">
                <div className="aa-triage-step__label">
                  3 · {working.type === "task" ? "Specify the task" : working.type === "project" ? "Specify the project" : "File the note"}
                </div>

                <div className="aa-spec-list">
                  {/* ---- Task: When · Size · Priority · Project · Goal ---- */}
                  {working.type === "task" && (
                    <>
                      <SpecRow
                        k="when" label="When" value={working.when}
                        open={openKey === "when"} onToggle={() => setOpenKey(openKey === "when" ? null : "when")}
                        options={WHEN_OPTS.map((o) => ({ value: o, label: o }))}
                        onPick={(v) => { setW({ when: v as Working["when"] }); setOpenKey(null); }}
                      />
                      <SpecRow
                        k="size" label="Size" value={working.size}
                        open={openKey === "size"} onToggle={() => setOpenKey(openKey === "size" ? null : "size")}
                        options={SIZE_OPTS.map((o) => ({ value: o, label: o }))}
                        onPick={(v) => { setW({ size: v as ParsedSize }); setOpenKey(null); }}
                      />
                      <SpecRow
                        k="priority" label="Priority" value={working.priority === "LOW" ? "Low" : working.priority === "IMPORTANT" ? "Important" : "Normal"}
                        open={openKey === "priority"} onToggle={() => setOpenKey(openKey === "priority" ? null : "priority")}
                        options={PRIORITY_OPTS.map((o) => ({ value: o, label: o === "LOW" ? "Low" : o === "IMPORTANT" ? "Important" : "Normal" }))}
                        onPick={(v) => { setW({ priority: v as ParsedPriority }); setOpenKey(null); }}
                      />
                      <SpecRow
                        k="project" label="Project" value={projectName ?? "General"} isDefault={!projectName} isProject
                        open={openKey === "project"} onToggle={() => setOpenKey(openKey === "project" ? null : "project")}
                        options={[]}
                        onPick={() => { setOpenKey(null); setProjectPickerOpen(true); }}
                        pickerHint="Choose…"
                      />
                      <SpecRow
                        k="goal" label="Goal" value={goalName ?? "—"} isDefault={!goalName} isProject
                        open={openKey === "goal"} onToggle={() => setOpenKey(openKey === "goal" ? null : "goal")}
                        options={[]}
                        onPick={() => { setOpenKey(null); setGoalPickerOpen(true); }}
                        pickerHint={goalName ? "Change…" : "Choose…"}
                      />
                    </>
                  )}

                  {/* ---- Project: Goal · Due ---- */}
                  {working.type === "project" && (
                    <>
                      <SpecRow
                        k="goal" label="Supports goal" value={(goals ?? []).find((g) => g.id === working.projectGoalId)?.name ?? "—"}
                        isDefault={!working.projectGoalId} isProject
                        open={openKey === "goal"} onToggle={() => setOpenKey(openKey === "goal" ? null : "goal")}
                        options={[]}
                        onPick={() => { setOpenKey(null); setGoalPickerOpen(true); }}
                        pickerHint={working.projectGoalId ? "Change…" : "Choose…"}
                      />
                      <SpecRow
                        k="due" label="Due" value={working.due}
                        open={openKey === "due"} onToggle={() => setOpenKey(openKey === "due" ? null : "due")}
                        options={DUE_OPTS.map((o) => ({ value: o, label: o }))}
                        onPick={(v) => { setW({ due: v as Working["due"] }); setOpenKey(null); }}
                      />
                    </>
                  )}

                  {/* ---- Resource (Note): Parent · Kind ---- */}
                  {working.type === "resource" && (
                    <>
                      <SpecRow
                        k="parent" label="File under" value={parentName ?? "Pick parent…"} isDefault={!parentName} isProject
                        open={openKey === "parent"} onToggle={() => setOpenKey(openKey === "parent" ? null : "parent")}
                        options={[]}
                        onPick={() => { setOpenKey(null); setParentProjectPickerOpen(true); }}
                        pickerHint={parentName ? "Change…" : "Choose…"}
                      />
                      <SpecRow
                        k="kind" label="Kind" value={working.kind}
                        open={openKey === "kind"} onToggle={() => setOpenKey(openKey === "kind" ? null : "kind")}
                        options={KIND_OPTS.map((o) => ({ value: o, label: o }))}
                        onPick={(v) => { setW({ kind: v as Working["kind"] }); setOpenKey(null); }}
                      />
                    </>
                  )}
                </div>

                {/* Confirm summary + Complete (gated) */}
                <div className="aa-triage-confirm">
                  <div className="aa-triage-confirm__summary">
                    {summaryFor(working, projectName ?? "General", goalName ?? null, parentName)}
                  </div>
                  <Button
                    variant="primary"
                    disabled={!canComplete(working)}
                    onClick={() => void dispatch()}
                  >
                    Complete
                  </Button>
                </div>
              </div>
            )}
          </TriageCard>
        )}
      </div>

      {/* ---- Project picker (Task → file into a project) ---- */}
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
                  className={`aa-triage__picker-item ${p.id === effectiveProjectId ? "current" : ""}`}
                  onClick={() => {
                    setW({ projectId: p.id });
                    setProjectPickerOpen(false);
                  }}
                >
                  <span className="aa-triage__picker-name">{p.name}</span>
                  {p.goal && <span className="aa-triage__picker-goal">{p.goal.name}</span>}
                  <span className="aa-triage__picker-num">{i + 1}</span>
                </button>
              </li>
            ))}
          </ul>
        </BottomSheet>
      )}

      {/* ---- Goal picker (Task → link a goal / Project → supports a goal) ---- */}
      {goalPickerOpen && item && (
        <BottomSheet
          title={`Link “${shortText}” to a goal`}
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
                    className={`aa-triage__picker-item ${
                      working?.type === "project"
                        ? g.id === working.projectGoalId ? "current" : ""
                        : g.id === working?.goalId ? "current" : ""
                    }`}
                    onClick={() => {
                      setW(working?.type === "project" ? { projectGoalId: g.id } : { goalId: g.id });
                      setGoalPickerOpen(false);
                    }}
                  >
                    <span className="aa-triage__picker-name">{g.name}</span>
                    <span className="aa-triage__picker-num">{i + 1}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </BottomSheet>
      )}

      {/* ---- Parent picker for a Resource/Note: choose project or goal ---- */}
      {parentProjectPickerOpen && item && (
        <BottomSheet
          title={`File note under`}
          onClose={() => setParentProjectPickerOpen(false)}
        >
          <ul className="aa-triage__picker-list">
            {(projects ?? []).map((p, i) => (
              <li key={p.id}>
                <button
                  type="button"
                  className={`aa-triage__picker-item ${p.id === working?.parentProjectId ? "current" : ""}`}
                  onClick={() => {
                    setW({ parentProjectId: p.id, parentGoalId: null });
                    setParentProjectPickerOpen(false);
                  }}
                >
                  <span className="aa-triage__picker-name">{p.name}</span>
                  <span className="aa-triage__picker-goal">project</span>
                  <span className="aa-triage__picker-num">{i + 1}</span>
                </button>
              </li>
            ))}
            <li>
              <button
                type="button"
                className="aa-triage__picker-item aa-triage__picker-item--create"
                onClick={() => {
                  setParentProjectPickerOpen(false);
                  setParentGoalPickerOpen(true);
                }}
              >
                <span className="aa-triage__picker-name">…or file under a goal</span>
              </button>
            </li>
          </ul>
        </BottomSheet>
      )}
      {parentGoalPickerOpen && item && (
        <BottomSheet
          title={`File note under a goal`}
          onClose={() => setParentGoalPickerOpen(false)}
        >
          {(goals ?? []).length === 0 ? (
            <p className="aa-triage__picker-empty">No goals yet — create one on the Goals page.</p>
          ) : (
            <ul className="aa-triage__picker-list">
              {(goals ?? []).map((g, i) => (
                <li key={g.id}>
                  <button
                    type="button"
                    className={`aa-triage__picker-item ${g.id === working?.parentGoalId ? "current" : ""}`}
                    onClick={() => {
                      setW({ parentGoalId: g.id, parentProjectId: null });
                      setParentGoalPickerOpen(false);
                    }}
                  >
                    <span className="aa-triage__picker-name">{g.name}</span>
                    <span className="aa-triage__picker-goal">goal</span>
                    <span className="aa-triage__picker-num">{i + 1}</span>
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

// ---- A single inline-expanding spec row (ported from triage-coauthor.html) ----
interface SpecOption { value: string; label: string; hint?: string | null; }
function SpecRow({
  k, label, value, options, onPick, onToggle, open,
  isDefault, isProject, pickerHint,
}: {
  k: string;
  label: string;
  value: string;
  options: SpecOption[];
  onPick: (v: string) => void;
  onToggle: () => void;
  open: boolean;
  isDefault?: boolean;
  isProject?: boolean;
  pickerHint?: string;
}) {
  // Value → tinting class (v-Today / v-Important / v-XL / is-default …).
  const valClass = `v-${value.replace(/\s/g, "")}`;
  const rowCls = [
    "aa-spec-row",
    valClass,
    isProject ? "is-project" : "",
    isDefault ? "is-default" : "",
    open ? "open" : "",
  ].filter(Boolean).join(" ");

  // Picker-backed rows (project/goal/parent) open their bottom sheet directly
  // on row click — they don't expand an inline option list. Inline rows toggle
  // an open state and render their options beneath.
  const pickerBacked = options.length === 0;

  return (
    <>
      <button
        type="button"
        className={rowCls}
        onClick={() => (pickerBacked ? onPick("") : onToggle())}
      >
        <span className="aa-spec-key">{label}</span>
        <span className="aa-spec-val">{value}</span>
        <svg className="aa-spec-chev" width="12" height="12" viewBox="0 0 16 16" fill="none">
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && !pickerBacked && (
        <div className="aa-spec-options">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              className={`aa-spec-opt ${o.label === value ? "active" : ""}`}
              onClick={() => onPick(o.value)}
            >
              <span>
                {o.label}
                {o.hint && <span className="aa-spec-opt-hint">{o.hint}</span>}
              </span>
              <svg className="opt-check" width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

// Plain-English readback of the commitment (TRIAGE.md §4 confirm summary).
function summaryFor(
  w: Working,
  projectName: string,
  goalName: string | null,
  parentName: string | null,
): string {
  if (w.type === "task") {
    const goalBit = goalName ? ` · supports ${goalName}` : "";
    return `→ ${w.when} · ${w.size} · ${w.priority === "LOW" ? "Low" : w.priority === "IMPORTANT" ? "Important" : "Normal"} · in ${projectName}${goalBit}`;
  }
  if (w.type === "project") {
    const goalBit = w.projectGoalId ? ` · supports ${goalName}` : "";
    return `→ new Project${goalBit}`;
  }
  return `→ ${w.kind} filed under ${parentName ?? "—"}`;
}

function formatAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hr ago`;
  return `${Math.floor(seconds / 86400)} days ago`;
}

/** Format a parsed-date chip label: today / tomorrow / yesterday / Mon D. */
function formatChipDate(date: Date): string {
  const d = new Date(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "tomorrow";
  if (diffDays === -1) return "yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Calendar-day equality — used to detect an `today`/`tonight` capture token. */
function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

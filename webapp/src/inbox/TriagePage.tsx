import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useQuery } from "wasp/client/operations";
import { getInboxItems, triageInboxItem } from "wasp/client/operations";
import { getAppData } from "wasp/client/operations";
import { useQueryClient } from "@tanstack/react-query";
import { TriageCard, Button, PickerSheet, SpecRow, type TriageExit } from "../components/ui";
import { useActiveLens } from "../app/lensContext";
import { getProjects } from "wasp/client/operations";
import { getProjectsForResolver } from "wasp/client/operations";
import { getGoals } from "wasp/client/operations";
import type { ParsedPriority, ParsedSize } from "./parseCapture";
import { resolveProjectCandidate } from "./projectResolver";
import {
  DUE_OPTS,
  KIND_OPTS,
  OUTCOME_EXIT,
  PRIORITY_OPTS,
  SIZE_OPTS,
  WHEN_OPTS,
  buildOutcome,
  buildTriageChips,
  canComplete as canCompleteWorking,
  formatAgo,
  formatPriority,
  isSameDay,
  summaryFor,
  type Step,
  type Working,
} from "./triageFlow";
import { useTriageKeyboard } from "./useTriageKeyboard";
import "./TriagePage.css";

/**
 * Triage — define each captured thing, one at a time.
 *
 * Triage is NOT speed-dispatch; it's the deliberate act of *specifying* a task.
 * So the review is a per-item wizard with explicit Continue steps and a final
 * Complete that commits the spec:
 *
 *   1. Classify        — what it becomes plus the Lens/Project destination.
 *   2. Spec            — inline-expanding property rows (When / Size / Priority
 *                        / Project for a Task), value-tinted.
 *   3. Complete        — commits the spec; gated until destination + filing target
 *                        (for Task/Resource) are set.
 *
 * Each Complete calls `triageInboxItem` (transforms the InboxItem into its
 * concrete type, deletes the original) and the exit direction encodes the call.
 * Canonical layout: docs/mockups/triage-coauthor.html.
 */

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
  const { data: appData } = useQuery(getAppData, { lensId: activeLens?.id });
  const lenses = appData?.lenses ?? [];

  const [idx, setIdx] = useState(startIdx);
  const [exit, setExit] = useState<TriageExit>(null);
  const [dispatched, setDispatched] = useState(false);
  const [entering, setEntering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---- Wizard state ----
  const [step, setStep] = useState<Step>("classify");
  // The Lens chosen by Classify. It may come from a visible Lens choice, a
  // `[[lens]]` token, or a concrete Project destination.
  const [chosenLensId, setChosenLensId] = useState<string | null>(null);
  const [working, setWorking] = useState<Working | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null); // expanded spec row
  const initializedItemId = useRef<string | null>(null);
  const lensTouchedRef = useRef(false);

  // Pickers for Project (file-into) / Goal (project support) — reuse the
  // bottom-sheet UI.
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
  const triageChips = useMemo(() => buildTriageChips(item), [item]);

  // Resolve a captured project hint to an actual project in the confirmed lens.
  // Two paths under grammar v2 (docs/specs/capture-grammar.md):
  //   1. Explicit pick at capture (typeahead) — item.parsedProject holds the
  //      exact project name. Exact case-insensitive name match.
  //   2. Free-text resolver — when no explicit pick, match project names from
  //      the inferred lens's project list against the cleaned text. Exact
  //      whitespace/sentence-boundary match; longest wins on ties. No fuzzy.
  // Link-only: no match → lands in General, user picks manually. No auto-create,
  // so a typo never spawns a stray project. (Declared after `item`/`projects`.)
  const resolvedProjectId = useMemo(() => {
    return resolveProjectCandidate(projects ?? [], {
      parsedProject: item?.parsedProject,
      text: item?.text,
    })?.id ?? null;
  }, [item?.parsedProject, item?.text, projects]);

  // ---- Lens inference: [[ ]] token → real lens (explicit path) ----
  // Seeded tokens (work/personal/me) resolve on `kind`; custom on exact name.
  // `[[ ]]` overrides the active-lens default AND the project-bridge inference
  // (explicit beats inferred). Null when absent or unrecognized (the parser
  // already drops unknown tokens, so any parsedLens value is a real candidate).
  const inferredLensFromToken = useMemo(() => {
    const token = item?.parsedLens;
    if (!token) return null;
    return (lenses ?? []).find((l) => {
      if (token === "work") return l.kind === "WORK";
      if (token === "personal" || token === "me") return l.kind === "PERSONAL";
      return l.name.toLowerCase() === token;
    }) ?? null;
  }, [item?.parsedLens, lenses]);

  // ---- Project-bridged lens inference (inferred path) ----
  // The resolver source: lightweight project tuples across all entitled lenses.
  // Two sub-paths: (a) explicit typeahead pick at capture (parsedProject carries
  // the name), (b) free-text resolver matching the cleaned text. When a project
  // matches, its Project + Lens becomes the Classify destination.
  const { data: resolverProjects } = useQuery(getProjectsForResolver, undefined, {
    enabled: !!activeLens,
  });
  const projectBridge = useMemo<{ projectId: string; lensId: string; projectName: string } | null>(() => {
    const all = resolverProjects ?? [];
    if (all.length === 0) return null;
    const match = resolveProjectCandidate(all, {
      parsedProject: item?.parsedProject,
      text: item?.text,
    });
    return match ? { projectId: match.id, lensId: match.lensId, projectName: match.name } : null;
  }, [resolverProjects, item?.parsedProject, item?.text]);

  // A concrete Project is the strongest destination signal: it supplies both
  // Project and Lens. A Lens token still preselects a visible Lens choice when
  // there is no concrete Project destination.
  const projectDestinationLens = projectBridge
    ? (lenses ?? []).find((l) => l.id === projectBridge.lensId) ?? null
    : null;
  const inferredLens = projectDestinationLens ?? inferredLensFromToken ?? null;
  const hasProjectDestination = !!projectBridge && !!projectDestinationLens;
  // Drives the hint label: "from project MVP" vs "from [[work]]".
  const lensInferenceLabel = projectBridge && inferredLens
      ? `from project ${projectBridge.projectName}`
      : inferredLensFromToken
        ? `from [[${item?.parsedLens}]] in your capture`
      : null;

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
    if (initializedItemId.current === item.id) return;
    initializedItemId.current = item.id;
    lensTouchedRef.current = false;
    setStep("classify");
    setChosenLensId(inferredLens?.id ?? activeLens?.id ?? null);
    setWorking({
      ...initWorking(),
      projectId: hasProjectDestination ? projectBridge.projectId : null,
    });
    setOpenKey(null);
  }, [item, activeLens?.id, initWorking, inferredLens, hasProjectDestination, projectBridge?.projectId]);

  useEffect(() => {
    if (!item || step !== "classify" || lensTouchedRef.current) return;
    const targetLensId = inferredLens?.id ?? activeLens?.id ?? null;
    if (!targetLensId) return;
    setChosenLensId((current) =>
      !current || current === activeLens?.id ? targetLensId : current,
    );
  }, [item, step, inferredLens?.id, activeLens?.id]);

  useEffect(() => {
    if (!item || !hasProjectDestination || !projectBridge || !projectDestinationLens) return;
    setChosenLensId(projectDestinationLens.id);
    setWorking((current) =>
      current && current.projectId !== projectBridge.projectId
        ? { ...current, projectId: projectBridge.projectId }
      : current,
    );
  }, [item, hasProjectDestination, projectBridge, projectDestinationLens]);

  const setW = useCallback(
    (patch: Partial<Working>) => setWorking((w) => (w ? { ...w, ...patch } : w)),
    [],
  );

  const canComplete = useCallback(
    (w: Working | null): boolean => canCompleteWorking(w, chosenLensId),
    [chosenLensId],
  );

  const classifyLensOptions = useMemo(
    () =>
      lenses.length > 0
        ? lenses
        : [
            { id: "Work", name: "Work", color: "indigo" },
            { id: "Me", name: "Me", color: "emerald" },
          ],
    [lenses],
  );

  const selectLensByIndex = useCallback(
    (index: number) => {
      if (hasProjectDestination) return;
      const lens = classifyLensOptions[index];
      if (!lens) return;
      lensTouchedRef.current = true;
      setChosenLensId(lens.id);
    },
    [classifyLensOptions, hasProjectDestination],
  );

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
          w.type === "project"
            ? w.projectGoalId ?? undefined
            : w.type === "resource"
              ? w.parentGoalId ?? undefined
              : undefined,
        priority: w.type === "task" ? w.priority : undefined,
        size: w.type === "task" ? w.size : undefined,
      });
      queryClient.invalidateQueries({ queryKey: ["getInboxItems"] });
      queryClient.invalidateQueries({ queryKey: ["getProjects"] });
      queryClient.invalidateQueries({ queryKey: ["getAppData"] });
      // Await the task-list refetch so navigating to Today/Upcoming/Someday
      // after completing an item never shows the stale pre-triage cache (the
      // race where a just-triaged task appears missing until a manual refresh).
      await queryClient.refetchQueries({ queryKey: ["getTasks"] });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Triage failed.");
      setDispatched(false);
      setExit(null);
      return;
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

  useTriageKeyboard({
    isComplete,
    hasItem: !!item,
    step,
    chosenLensId,
    working,
    openKey,
    pickerOpen: projectPickerOpen || goalPickerOpen || parentProjectPickerOpen || parentGoalPickerOpen,
    canComplete,
    dispatch,
    navigateToInbox: () => navigate("/app/inbox"),
    setOpenKey,
    setStep,
    setWorkingType: (type) => {
      if (type === "project" && hasProjectDestination) return;
      setW({ type });
    },
    selectLensByIndex,
  });

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

  // Effective project = manual picker choice > resolved #token link. Drives both
  // the SpecRow display and what dispatch sends; a manual pick always wins.
  const effectiveProjectId = working?.projectId ?? resolvedProjectId ?? null;
  const projectName =
    (projects ?? []).find((p) => p.id === effectiveProjectId)?.name ?? null;
  const projectGoalName =
    (goals ?? []).find((g) => g.id === working?.projectGoalId)?.name ?? null;
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
            {/* ============ STEP 1: Classify ============ */}
            {step === "classify" && (
              <div className="aa-triage-step">
                <div className="aa-triage-step__label">1 · Classify</div>
                {hasProjectDestination ? (
                  <div className="aa-triage-destination">
                    <span className="aa-triage-destination__label">Destination</span>
                    <span className="aa-triage-destination__value">
                      {projectBridge?.projectName} · {projectDestinationLens?.name}
                    </span>
                  </div>
                ) : (
                  <>
                    {lensInferenceLabel && inferredLens && (
                      <p className="aa-triage-step__hint" aria-live="polite">
                        {lensInferenceLabel}
                      </p>
                    )}
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
                          onClick={() => {
                            lensTouchedRef.current = true;
                            setChosenLensId(l.id);
                          }}
                        >
                          <span className="aa-triage-radio__dot" aria-hidden="true" />
                          {l.name}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                <div className="aa-triage-types">
                  {([
                    ["task", "Task", "an action — something to do"],
                    ["project", "Project", "an outcome needing more than one step"],
                    ["resource", "Note", "reference material — not an action"],
                    ["archive", "Archive", "I will not do now — keep it for later"],
                  ] as const)
                    // A captured/resolved project means this is a task *in*
                    // that project by default, not a new project by the same
                    // name. Hide that option here; the project can still be
                    // changed from Spec.
                    .filter(([t]) => !(t === "project" && (item.parsedProject || hasProjectDestination)))
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
                  disabled={!chosenLensId}
                >
                  {working.type === "archive" ? "Archive" : "Continue"}
                </Button>
              </div>
            )}

            {/* ============ STEP 2: Spec ============ */}
            {step === "spec" && (
              <div className="aa-triage-step">
                <div className="aa-triage-step__label">
                  2 · {working.type === "task" ? "Specify the task" : working.type === "project" ? "Specify the project" : "File the note"}
                </div>

                <div className="aa-spec-list">
                  {/* ---- Task: When · Size · Priority · Project ---- */}
                  {working.type === "task" && (
                    <>
                      <SpecRow
                        label="When" value={working.when}
                        open={openKey === "when"} onToggle={() => setOpenKey(openKey === "when" ? null : "when")}
                        options={WHEN_OPTS.map((o) => ({ value: o, label: o }))}
                        onPick={(v) => { setW({ when: v as Working["when"] }); setOpenKey(null); }}
                      />
                      <SpecRow
                        label="Size" value={working.size}
                        open={openKey === "size"} onToggle={() => setOpenKey(openKey === "size" ? null : "size")}
                        options={SIZE_OPTS.map((o) => ({ value: o, label: o }))}
                        onPick={(v) => { setW({ size: v as ParsedSize }); setOpenKey(null); }}
                      />
                      <SpecRow
                        label="Priority" value={formatPriority(working.priority)}
                        open={openKey === "priority"} onToggle={() => setOpenKey(openKey === "priority" ? null : "priority")}
                        options={PRIORITY_OPTS.map((o) => ({ value: o, label: formatPriority(o) }))}
                        onPick={(v) => { setW({ priority: v as ParsedPriority }); setOpenKey(null); }}
                      />
                      <SpecRow
                        label="Project" value={projectName ?? "General"} isDefault={!projectName} isProject
                        open={openKey === "project"} onToggle={() => setOpenKey(openKey === "project" ? null : "project")}
                        options={[]}
                        onPick={() => { setOpenKey(null); setProjectPickerOpen(true); }}
                      />
                    </>
                  )}

                  {/* ---- Project: Goal · Due ---- */}
                  {working.type === "project" && (
                    <>
                      <SpecRow
                        label="Supports goal" value={projectGoalName ?? "—"}
                        isDefault={!working.projectGoalId} isProject
                        open={openKey === "goal"} onToggle={() => setOpenKey(openKey === "goal" ? null : "goal")}
                        options={[]}
                        onPick={() => { setOpenKey(null); setGoalPickerOpen(true); }}
                      />
                      <SpecRow
                        label="Due" value={working.due}
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
                        label="File under" value={parentName ?? "Pick parent…"} isDefault={!parentName} isProject
                        open={openKey === "parent"} onToggle={() => setOpenKey(openKey === "parent" ? null : "parent")}
                        options={[]}
                        onPick={() => { setOpenKey(null); setParentProjectPickerOpen(true); }}
                      />
                      <SpecRow
                        label="Kind" value={working.kind}
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
                    {summaryFor(working, projectName ?? "General", projectGoalName ?? null, parentName)}
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
        <PickerSheet
          title={`File “${shortText}” in`}
          items={(projects ?? []).map((p) => ({
            id: p.id,
            label: p.name,
            meta: p.goal?.name,
            current: p.id === effectiveProjectId,
          }))}
          onPick={(id) => {
            setW({ projectId: id });
            setProjectPickerOpen(false);
          }}
          onClose={() => setProjectPickerOpen(false)}
        />
      )}

      {/* ---- Goal picker (Project → supports a goal) ---- */}
      {goalPickerOpen && item && (
        <PickerSheet
          title={`Choose goal for “${shortText}”`}
          items={(goals ?? []).map((g) => ({
            id: g.id,
            label: g.name,
            current: g.id === working?.projectGoalId,
          }))}
          emptyMessage="No goals yet — create one on the Goals page."
          onPick={(id) => {
            setW({ projectGoalId: id });
            setGoalPickerOpen(false);
          }}
          onClose={() => setGoalPickerOpen(false)}
        />
      )}

      {/* ---- Parent picker for a Resource/Note: choose project or goal ---- */}
      {parentProjectPickerOpen && item && (
        <PickerSheet
          title={`File note under`}
          items={(projects ?? []).map((p) => ({
            id: p.id,
            label: p.name,
            meta: "project",
            current: p.id === working?.parentProjectId,
          }))}
          action={{
            label: "…or file under a goal",
            onPick: () => {
              setParentProjectPickerOpen(false);
              setParentGoalPickerOpen(true);
            },
          }}
          onPick={(id) => {
            setW({ parentProjectId: id, parentGoalId: null });
            setParentProjectPickerOpen(false);
          }}
          onClose={() => setParentProjectPickerOpen(false)}
        />
      )}
      {parentGoalPickerOpen && item && (
        <PickerSheet
          title={`File note under a goal`}
          items={(goals ?? []).map((g) => ({
            id: g.id,
            label: g.name,
            meta: "goal",
            current: g.id === working?.parentGoalId,
          }))}
          emptyMessage="No goals yet — create one on the Goals page."
          onPick={(id) => {
            setW({ parentGoalId: id, parentProjectId: null });
            setParentGoalPickerOpen(false);
          }}
          onClose={() => setParentGoalPickerOpen(false)}
        />
      )}
    </div>
  );
}

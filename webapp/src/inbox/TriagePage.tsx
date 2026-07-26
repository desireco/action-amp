import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router";
import type { NavigateFunction } from "react-router";
import { useQuery } from "wasp/client/operations";
import { getInboxItems, triageInboxItem } from "wasp/client/operations";
import { getAppData } from "wasp/client/operations";
import type { Project, Goal } from "@prisma/client";
import { useQueryClient } from "@tanstack/react-query";
import {
  TriageCard,
  Button,
  PickerSheet,
  PropertyChips,
  type TriageExit,
} from "../components/ui";
import {
  StarIcon,
  ProjectsIcon,
  LogbookIcon,
  SomedayIcon,
  TrashIcon,
} from "../components/ui/icons";
import { useActiveLens } from "../app/lensContext";
import { getProjects } from "wasp/client/operations";
import { getProjectsForResolver } from "wasp/client/operations";
import { getGoals } from "wasp/client/operations";
import { resolveProjectCandidate } from "./projectResolver";
import {
  OUTCOME_EXIT,
  buildDispatchPayload,
  buildTriageChips,
  canComplete as canCompleteWorking,
  summaryFor,
  type Step,
  type Working,
} from "./triageFlow";
import {
  taskFields,
  projectFields,
  resourceFields,
  chipPickToWorkingPatch,
} from "./triagePropertyFields";
import { formatAgo, isSameDay } from "../shared/dateFormat";
import { useTriageKeyboard } from "./useTriageKeyboard";
import "./TriagePage.css";

/**
 * Triage — define each captured thing, one at a time.
 *
 * Triage is NOT speed-dispatch; it's the deliberate act of *specifying* a task.
 * So the review is a per-item wizard with explicit Continue steps and a final
 * Ready that commits the spec:
 *
 *   1. Classify        — what it becomes plus the Lens/Project destination.
 *   2. Spec            — inline-expanding property rows (When / Size / Priority
 *                        / Project for a Task), value-tinted.
 *   3. Ready           — commits the spec; gated until destination + filing target
 *                        (for Task/Resource) are set.
 *
 * Each Ready action calls `triageInboxItem` (transforms the InboxItem into its
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
  // Tracks whether any PropertyChips popover / picker sheet is open — used to
  // gate the property-key shortcuts (don't fire [ / ] / - / = / H while a
  // chip popover is open). The chip editor owns its own open state; this is
  // just the page-level mirror via onOpenChange.
  const [chipOpen, setChipOpen] = useState(false);
  const initializedItemId = useRef<string | null>(null);
  const lensTouchedRef = useRef(false);

  // Pickers for Project (file-into) / Goal (project support) — reuse
  // the bottom-sheet UI.
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
  // getInboxItems after each Ready action shrinks `list`, shifting indices
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
      title: item?.text ?? "",
      // Default When = Upcoming (decided 2026-06-25). A triaged task is
      // actionable — it lands on the Upcoming bench (reachable from Today's
      // "See upcoming" and /app/upcoming), not buried in Someday. Today stays
      // un-cluttered EXCEPT when the user said so explicitly at capture: an
      // `today`/`tonight` token is intent, not a default, so it pre-fills Today
      // (the "no auto-Today by default" principle still holds for everything else).
      when: item?.parsedDate && isSameDay(item.parsedDate, new Date()) ? "Today" : "Upcoming",
      size: item?.parsedSize ?? "M",
      priority: item?.parsedPriority ?? "NORMAL",
      content: "",
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
    setChipOpen(false);
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
    const payload = buildDispatchPayload(w, {
      inboxItemId: item.id,
      lensId: chosenLensId,
      resolvedProjectId,
    });
    setDispatched(true);
    setExit(OUTCOME_EXIT[payload.decision]);
    try {
      await triageInboxItem(payload);
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
  }, [idx, total, exit, activeLens, working, chosenLensId, item, queryClient, resolvedProjectId]);

  useTriageKeyboard({
    isComplete,
    hasItem: !!item,
    step,
    chosenLensId,
    working,
    chipOpen,
    pickerOpen: projectPickerOpen || goalPickerOpen || parentProjectPickerOpen || parentGoalPickerOpen,
    canComplete,
    dispatch,
    navigateToInbox: () => navigate("/app/inbox"),
    setChipOpen,
    setStep,
    setWorkingType: (type) => {
      if (type === "project" && hasProjectDestination) return;
      setW({ type });
    },
    selectLensByIndex,
    // Property-key shortcuts in the spec step — [ / ] size, - / = priority,
    // H cycle when. Patched straight into the working draft via setW.
    applyPropertyKey: (patch) => setW(patch),
  });

  if (isComplete) {
    return <TriageComplete start={start} onNavigate={navigate} />;
  }

  // Effective project = manual picker choice > resolved #token link. Drives both
  // the SpecRow display and what dispatch sends; a manual pick always wins.
  const effectiveProjectId = working?.projectId ?? resolvedProjectId ?? null;
  const projectName =
    (projects ?? []).find((p: Project) => p.id === effectiveProjectId)?.name ?? null;
  const projectGoalName =
    (goals ?? []).find((g: Goal) => g.id === working?.projectGoalId)?.name ?? null;
  const parentName = working
    ? working.parentProjectId
      ? (projects ?? []).find((p: Project) => p.id === working.parentProjectId)?.name ?? null
      : working.parentGoalId
        ? (goals ?? []).find((g: Goal) => g.id === working.parentGoalId)?.name ?? null
        : null
    : null;

  // Lenses — fall back to the seeded two so the classify pills have something
  // to show even before getAppData resolves (and during tests). Mirrors the
  // fallback the old lens radiogroup used.
  const lensList = lenses.length > 0
    ? lenses
    : [
        { id: "Work", name: "Work", color: "indigo", kind: "WORK", purpose: null },
        { id: "Me", name: "Me", color: "emerald", kind: "PERSONAL", purpose: null },
      ];
  // The active lens as a picker chip — passed to PickerSheet items so each
  // project row shows which lens (context) it lives in. All projects in these
  // pickers share the chosen lens (the query is scoped), but the chip
  // reinforces the context and future-proofs for cross-lens filing.
  const activeLensForChip = lensList.find((l) => l.id === (scopedLensId ?? chosenLensId));
  const lensChip = activeLensForChip
    ? { label: activeLensForChip.name, color: activeLensForChip.color }
    : null;

  return (
    <div className="aa-triage">
      {/* ---- Top: close + progress ---- */}
      <TriageProgress
        done={done}
        remaining={remaining}
        onClose={() => navigate("/app/inbox")}
      />

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
            body={working.title}
            onBodyChange={step === "spec" ? (title) => setW({ title }) : undefined}
            meta={`captured ${formatAgo(item.createdAt)}`}
            chips={triageChips}
            exit={exit}
            dispatched={dispatched}
            entering={entering}
          >
            {/* ============ STEP 1: Classify ============ */}
            {step === "classify" && (
              <ClassifyStep
                working={working}
                chosenLensId={chosenLensId}
                lenses={lensList}
                hasProjectDestination={hasProjectDestination}
                destination={
                  hasProjectDestination && projectBridge && projectDestinationLens
                    ? { project: projectBridge.projectName, lens: projectDestinationLens.name }
                    : null
                }
                inferenceLabel={lensInferenceLabel}
                hasInferredLens={!!inferredLens}
                hasParsedProject={!!item.parsedProject}
                onSelectLens={(id) => {
                  lensTouchedRef.current = true;
                  setChosenLensId(id);
                }}
                onSetType={(t) => setW({ type: t })}
                onContinue={() =>
                  working.type === "archive" || working.type === "delete"
                    ? void dispatch()
                    : setStep("spec")
                }
              />
            )}

            {/* ============ STEP 2: Spec ============ */}
            {step === "spec" && (
              <SpecStep
                working={working}
                projectName={projectName}
                projectGoalName={projectGoalName}
                parentName={parentName}
                setW={setW}
                onPickerOpen={(key) => {
                  if (key === "project") setProjectPickerOpen(true);
                  else if (key === "goal") setGoalPickerOpen(true);
                  else if (key === "parent") setParentProjectPickerOpen(true);
                }}
                onChipOpenChange={setChipOpen}
                canComplete={canComplete(working)}
                onBack={() => setStep("classify")}
                onReady={() => void dispatch()}
              />
            )}
          </TriageCard>
        )}
      </div>

      {/* ---- File-into pickers (Project / Goal / parent-Project / parent-Goal) ---- */}
      <TriagePickers
        open={{
          project: projectPickerOpen,
          goal: goalPickerOpen,
          parentProject: parentProjectPickerOpen,
          parentGoal: parentGoalPickerOpen,
        }}
        itemPresent={!!item}
        shortText={shortText}
        projects={projects ?? []}
        goals={goals ?? []}
        working={working}
        effectiveProjectId={effectiveProjectId}
        lensChip={lensChip}
        setW={setW}
        setProjectOpen={setProjectPickerOpen}
        setGoalOpen={setGoalPickerOpen}
        setParentProjectOpen={setParentProjectPickerOpen}
        setParentGoalOpen={setParentGoalPickerOpen}
      />
    </div>
  );
}

// ── Presentational sub-components ──────────────────────────────────────────
// Extracted from TriagePage so the orchestrator reads as state + a flat tree.
// Each is presentational: behavior lives in TriagePage, these just render.

const TRIAGE_TYPES = [
  { t: "task", label: "Task", sub: "an action — something to do", Icon: StarIcon },
  { t: "project", label: "Project", sub: "an outcome needing more than one step", Icon: ProjectsIcon },
  { t: "resource", label: "Note", sub: "reference material — not an action", Icon: LogbookIcon },
  { t: "archive", label: "Archive", sub: "not now — keep it for later", Icon: SomedayIcon },
  { t: "delete", label: "Delete", sub: "get rid of it — not kept", Icon: TrashIcon },
] as const;

type ClassifyLens = { id: string; name: string; color?: string | null };

/** Step 1 — pick the type (Task/Project/Note/Archive) + Lens/Project destination. */
function ClassifyStep({
  working,
  chosenLensId,
  lenses,
  hasProjectDestination,
  destination,
  inferenceLabel,
  hasInferredLens,
  hasParsedProject,
  onSelectLens,
  onSetType,
  onContinue,
}: {
  working: Working;
  chosenLensId: string | null;
  lenses: ClassifyLens[];
  hasProjectDestination: boolean;
  destination: { project: string; lens: string } | null;
  inferenceLabel: string | null;
  hasInferredLens: boolean;
  hasParsedProject: boolean;
  onSelectLens: (id: string) => void;
  onSetType: (t: Working["type"]) => void;
  onContinue: () => void;
}) {
  return (
    <div className="aa-triage-step">
      <div className="aa-triage-step__label">1 · Classify</div>
      {hasProjectDestination ? (
        <div className="aa-triage-destination">
          <span className="aa-triage-destination__label">Destination</span>
          <span className="aa-triage-destination__value">
            {destination?.project} · {destination?.lens}
          </span>
        </div>
      ) : (
        <>
          {inferenceLabel && hasInferredLens && (
            <p className="aa-triage-step__hint" aria-live="polite">
              {inferenceLabel}
            </p>
          )}
          {/* Lens — inline pills, radio-style. One pill per lens, click to
              select; the active pill fills with the lens's identity color. */}
          <div className="aa-triage-lens-pills" role="radiogroup" aria-label="Lens">
            {lenses.map((l) => {
              const active = chosenLensId === l.id;
              return (
                <button
                  key={l.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  data-lens-color={l.color ?? undefined}
                  className={`aa-triage-lens-pill ${active ? "active" : ""}`}
                  onClick={() => onSelectLens(l.id)}
                >
                  <span className="aa-triage-lens-pill__dot" aria-hidden="true" />
                  {l.name}
                </button>
              );
            })}
          </div>
        </>
      )}
      <div className="aa-triage-types">
        {TRIAGE_TYPES
          // A captured/resolved project means this is a task *in* that project
          // by default, not a new project by the same name — hide that option.
          .filter(({ t }) => !(t === "project" && (hasParsedProject || hasProjectDestination)))
          .map(({ t, label, sub, Icon }) => (
            <button
              key={t}
              type="button"
              className={`aa-triage-type ${working.type === t ? "active" : ""}`}
              onClick={() => onSetType(t)}
            >
              <Icon className="aa-triage-type__icon" />
              <span className="aa-triage-type__label">{label}</span>
              <span className="aa-triage-type__sub">{sub}</span>
            </button>
          ))}
      </div>
      <Button
        variant="primary"
        className="aa-triage-step__continue"
        onClick={onContinue}
        // Archive + Delete discard the item — neither files into a lens, so
        // neither should wait for a lens choice. Every other type does.
        disabled={
          !chosenLensId && working.type !== "archive" && working.type !== "delete"
        }
      >
        {working.type === "archive"
          ? "Archive"
          : working.type === "delete"
            ? "Delete"
            : "Continue"}
      </Button>
    </div>
  );
}

/** Step 2 — specify the entity (chips + notes) and commit (Ready) or go Back. */
function SpecStep({
  working,
  projectName,
  projectGoalName,
  parentName,
  setW,
  onPickerOpen,
  onChipOpenChange,
  canComplete,
  onBack,
  onReady,
}: {
  working: Working;
  projectName: string | null;
  projectGoalName: string | null;
  parentName: string | null;
  setW: (patch: Partial<Working>) => void;
  onPickerOpen: (key: string) => void;
  onChipOpenChange: (open: boolean) => void;
  canComplete: boolean;
  onBack: () => void;
  onReady: () => void;
}) {
  return (
    <div className="aa-triage-step">
      <div className="aa-triage-step__label">
        2 · {working.type === "task" ? "Specify the task" : working.type === "project" ? "Specify the project" : "File the note"}
      </div>
      <div className="aa-triage-spec">
        {/* The chip row IS the editor — same component as the task page.
            Project/Goal/Parent are external pickers (triage owns those
            sheets); task Notes stay a textarea — prose, not a chip. */}
        {working.type === "task" && (
          <>
            <PropertyChips
              fields={taskFields({ working, projectName, projectGoalName, parentName, projectIsDefault: !projectName })}
              onPick={(key, value) => setW(chipPickToWorkingPatch(key, value))}
              onPickerOpen={(key) => { if (key === "project") onPickerOpen("project"); }}
              onOpenChange={onChipOpenChange}
            />
            <label className="aa-triage-notes">
              <span className="aa-triage-notes__label">Notes</span>
              <textarea
                className="aa-triage-notes__textarea"
                aria-label="Task notes"
                value={working.content}
                onChange={(e) => setW({ content: e.target.value })}
                rows={4}
                placeholder="Add details, criteria, or reminders"
              />
            </label>
          </>
        )}
        {working.type === "project" && (
          <PropertyChips
            fields={projectFields({ working, projectName, projectGoalName, parentName, projectIsDefault: !projectName })}
            onPick={(key, value) => setW(chipPickToWorkingPatch(key, value))}
            onPickerOpen={(key) => { if (key === "goal") onPickerOpen("goal"); }}
            onOpenChange={onChipOpenChange}
          />
        )}
        {working.type === "resource" && (
          <PropertyChips
            fields={resourceFields({ working, projectName, projectGoalName, parentName, projectIsDefault: !projectName })}
            onPick={(key, value) => setW(chipPickToWorkingPatch(key, value))}
            onPickerOpen={(key) => { if (key === "parent") onPickerOpen("parent"); }}
            onOpenChange={onChipOpenChange}
          />
        )}
      </div>
      {/* Confirm summary + Ready (gated). Back returns to Classify so the
          type or lens can change without restarting the whole item. */}
      <div className="aa-triage-confirm">
        <div className="aa-triage-confirm__summary">
          {summaryFor(working, projectName ?? "General", projectGoalName ?? null, parentName)}
        </div>
        <Button variant="ghost" onClick={onBack}>Back</Button>
        <Button variant="primary" disabled={!canComplete} onClick={onReady}>Ready</Button>
      </div>
    </div>
  );
}

/** The end-of-triage empty state ("Inbox zero" / "Caught up from here"). */
function TriageComplete({
  start,
  onNavigate,
}: {
  start: number;
  onNavigate: NavigateFunction;
}) {
  const reachedFromTop = start === 0;
  return (
    <div className="aa-triage-empty">
      <div className="aa-empty-mark" aria-hidden="true">
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
          <Button variant="primary" onClick={() => onNavigate("/app")}>Done →</Button>
        ) : (
          <Button variant="primary" onClick={() => onNavigate("/app/inbox/review")}>
            Triage earlier →
          </Button>
        )}
        <Button variant="secondary" onClick={() => onNavigate("/app/inbox")}>Back to inbox</Button>
      </div>
    </div>
  );
}

type PickerProject = { id: string; name: string; goal?: { name: string } | null };
type PickerGoal = { id: string; name: string };

/** The four file-into pickers (Project / Goal / parent-Project / parent-Goal). */
function TriagePickers({
  open,
  itemPresent,
  shortText,
  projects,
  goals,
  working,
  effectiveProjectId,
  lensChip,
  setW,
  setProjectOpen,
  setGoalOpen,
  setParentProjectOpen,
  setParentGoalOpen,
}: {
  open: { project: boolean; goal: boolean; parentProject: boolean; parentGoal: boolean };
  itemPresent: boolean;
  shortText: string;
  projects: PickerProject[];
  goals: PickerGoal[];
  working: Working | null;
  effectiveProjectId: string | null;
  lensChip: { label: string; color: string | null } | null;
  setW: (patch: Partial<Working>) => void;
  setProjectOpen: (open: boolean) => void;
  setGoalOpen: (open: boolean) => void;
  setParentProjectOpen: (open: boolean) => void;
  setParentGoalOpen: (open: boolean) => void;
}) {
  return (
    <>
      {open.project && itemPresent && (
        <PickerSheet
          title={`File “${shortText}” in`}
          items={projects.map((p) => ({
            id: p.id,
            label: p.name,
            chip: lensChip,
            meta: p.goal?.name ?? null,
            current: p.id === effectiveProjectId,
          }))}
          onPick={(id) => {
            setW({ projectId: id });
            setProjectOpen(false);
          }}
          onClose={() => setProjectOpen(false)}
        />
      )}

      {open.goal && itemPresent && (
        <PickerSheet
          title={`Choose goal for “${shortText}”`}
          items={goals.map((g) => ({
            id: g.id,
            label: g.name,
            chip: lensChip,
            current: g.id === working?.projectGoalId,
          }))}
          emptyMessage="No goals yet — make one on the Goals page."
          onPick={(id) => {
            setW({ projectGoalId: id });
            setGoalOpen(false);
          }}
          onClose={() => setGoalOpen(false)}
        />
      )}

      {open.parentProject && itemPresent && (
        <PickerSheet
          title="File note under a project"
          items={projects.map((p) => ({
            id: p.id,
            label: p.name,
            chip: lensChip,
            meta: p.goal?.name ?? null,
            current: p.id === working?.parentProjectId,
          }))}
          action={{
            label: "…or file under a goal",
            onPick: () => {
              setParentProjectOpen(false);
              setParentGoalOpen(true);
            },
          }}
          onPick={(id) => {
            setW({ parentProjectId: id, parentGoalId: null });
            setParentProjectOpen(false);
          }}
          onClose={() => setParentProjectOpen(false)}
        />
      )}

      {open.parentGoal && itemPresent && (
        <PickerSheet
          title="File note under a goal"
          items={goals.map((g) => ({
            id: g.id,
            label: g.name,
            chip: lensChip,
            current: g.id === working?.parentGoalId,
          }))}
          emptyMessage="No goals yet — make one on the Goals page."
          onPick={(id) => {
            setW({ parentGoalId: id, parentProjectId: null });
            setParentGoalOpen(false);
          }}
          onClose={() => setParentGoalOpen(false)}
        />
      )}
    </>
  );
}

/** The top bar: close button + session progress count and bar. */
function TriageProgress({
  done,
  remaining,
  onClose,
}: {
  done: number;
  remaining: number;
  onClose: () => void;
}) {
  return (
    <div className="aa-triage__top">
      <button
        type="button"
        className="aa-triage__close"
        onClick={onClose}
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
  );
}

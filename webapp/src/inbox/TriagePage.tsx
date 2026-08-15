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
  TrashIcon,
  BoxIcon,
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

  // `startIdx` rotates the queue below; the walkthrough itself always starts
  // at position zero in that rotated queue.
  const [idx, setIdx] = useState(0);
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

  // Projects + goals scoped to the *confirmed* lens (step 1 output), not the
  // active one — filing targets must match where the item is actually landing.
  const scopedLensId = chosenLensId ?? activeLens?.id ?? null;
  const scopedLens = lenses.find((lens) => lens.id === scopedLensId) ?? activeLens;
  const isSimpleListDestination = scopedLens?.type === "SIMPLE_LIST";
  const { data: projects } = useQuery(
    getProjects,
    scopedLensId && !isSimpleListDestination ? { lensId: scopedLensId } : undefined,
    { enabled: !!scopedLensId && !isSimpleListDestination },
  );
  const { data: goals } = useQuery(
    getGoals,
    scopedLensId && !isSimpleListDestination ? { lensId: scopedLensId } : undefined,
    { enabled: !!scopedLensId && !isSimpleListDestination },
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

  // A row click starts triage at that item, but never narrows the queue. Once
  // the newer items have been specified, wrap around to the earlier ones so a
  // triage session always drains every item that was waiting on entry.
  const triageList = useMemo(() => {
    const queue = snapshot ?? list;
    if (queue.length === 0 || startIdx === 0) return queue;
    const pivot = Math.min(startIdx, queue.length);
    return [...queue.slice(pivot), ...queue.slice(0, pivot)];
  }, [list, snapshot, startIdx]);

  const total = triageList.length;
  const remaining = total;
  const done = idx;
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
    if (item?.parsedProjectId) {
      return (projects ?? []).some((project) => project.id === item.parsedProjectId)
        ? item.parsedProjectId
        : null;
    }
    return resolveProjectCandidate(projects ?? [], {
      parsedProject: item?.parsedProject,
      text: item?.text,
    })?.id ?? null;
  }, [item?.parsedProject, item?.parsedProjectId, item?.text, projects]);

  // ---- Lens inference: [[ ]] token → real lens (explicit path) ----
  // Seeded tokens (work/personal/me) resolve on `kind`; custom on exact name.
  // `[[ ]]` overrides the active-lens default AND the project-bridge inference
  // (explicit beats inferred). Null when absent or unrecognized (the parser
  // already drops unknown tokens, so any parsedLens value is a real candidate).
  const inferredLensFromToken = useMemo(() => {
    if (item?.parsedLensId) {
      return (lenses ?? []).find((lens) => lens.id === item.parsedLensId) ?? null;
    }
    const token = item?.parsedLens;
    if (!token) return null;
    return (lenses ?? []).find((l) => {
      if (token === "work") return l.kind === "WORK";
      if (token === "personal" || token === "me") return l.kind === "PERSONAL";
      return l.name.toLowerCase() === token;
    }) ?? null;
  }, [item?.parsedLens, item?.parsedLensId, lenses]);

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
    const directlySelected = item?.parsedProjectId
      ? all.find((project) => project.id === item.parsedProjectId)
      : null;
    if (directlySelected) {
      return { projectId: directlySelected.id, lensId: directlySelected.lensId, projectName: directlySelected.name };
    }
    const match = resolveProjectCandidate(all, {
      parsedProject: item?.parsedProject,
      text: item?.text,
    });
    return match ? { projectId: match.id, lensId: match.lensId, projectName: match.name } : null;
  }, [resolverProjects, item?.parsedProject, item?.parsedProjectId, item?.text]);

  // An explicit [[lens]] token wins over inferred project context. This is
  // essential for [[simple-list]] capture: project-like text must not divert
  // the item back into a Life-area task flow.
  const projectDestinationLens = projectBridge
    ? (lenses ?? []).find((l) => l.id === projectBridge.lensId) ?? null
    : null;
  const hasExplicitProjectDestination = !!item?.parsedProjectId && !!projectBridge && !!projectDestinationLens;
  const inferredLens = hasExplicitProjectDestination
    ? projectDestinationLens
    : inferredLensFromToken ?? projectDestinationLens ?? null;
  const hasProjectDestination = hasExplicitProjectDestination || (!inferredLensFromToken && !!projectBridge && !!projectDestinationLens);
  // Drives the hint label: "from project MVP" vs "from [[work]]".
  const lensInferenceLabel = hasExplicitProjectDestination
      ? `selected project ${projectBridge?.projectName}`
      : item?.parsedLensId && inferredLensFromToken
        ? `selected ${inferredLensFromToken.name}`
      : inferredLensFromToken
      ? `from [[${item?.parsedLens}]] in your capture`
      : projectBridge && inferredLens
        ? `from project ${projectBridge.projectName}`
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
      // "See upcoming" and /do/upcoming), not buried in Someday. Today stays
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

  useEffect(() => {
    if (!working || !scopedLens) return;
    if (
      scopedLens.type === "SIMPLE_LIST" &&
      working.type !== "list-item" &&
      working.type !== "delete"
    ) {
      setWorking({ ...working, type: "list-item" });
    } else if (scopedLens.type === "LIFE_AREA" && working.type === "list-item") {
      setWorking({ ...working, type: "task" });
    }
  }, [scopedLens?.id, scopedLens?.type, working?.type]);

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
            { id: "Work", name: "Work", color: "indigo", type: "LIFE_AREA" as const },
            { id: "Me", name: "Me", color: "emerald", type: "LIFE_AREA" as const },
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
      // The first completed triage advances first-run guidance to complete.
      queryClient.invalidateQueries({ queryKey: ["auth/me"] });
      // Await the task-list refetch so navigating to Today/Upcoming/Someday
      // after completing an item never shows the stale pre-triage cache (the
      // race where a just-triaged task appears missing until a manual refresh).
      if (payload.decision !== "list-item") {
        await queryClient.refetchQueries({ queryKey: ["getTasks"] });
      }
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
    pickerOpen: projectPickerOpen || goalPickerOpen || parentProjectPickerOpen,
    canComplete,
    dispatch,
    navigateToInbox: () => navigate("/do/inbox"),
    setChipOpen,
    setStep,
    setWorkingType: (type) => {
      if (type === "project" && hasProjectDestination) return;
      if (isSimpleListDestination && type !== "delete") {
        setW({ type: "list-item" });
        return;
      }
      setW({ type });
    },
    selectLensByIndex,
    // Property-key shortcuts in the spec step — [ / ] size, - / = priority,
    // H cycle when. Patched straight into the working draft via setW.
    applyPropertyKey: (patch) => setW(patch),
  });

  if (isComplete) {
    return <TriageComplete onNavigate={navigate} />;
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
      : null
    : null;

  // Lenses — fall back to the seeded two so the classify pills have something
  // to show even before getAppData resolves (and during tests). Mirrors the
  // fallback the old lens radiogroup used.
  const lensList: ClassifyLens[] = lenses.length > 0
    ? lenses
    : [
        { id: "Work", name: "Work", color: "indigo", type: "LIFE_AREA" },
        { id: "Me", name: "Me", color: "emerald", type: "LIFE_AREA" },
      ];
  // The active lens as a picker chip — passed to PickerSheet items so each
  // project row shows which lens (context) it lives in. All projects in these
  // pickers share the chosen lens (the query is scoped), but the chip
  // reinforces the context and future-proofs for cross-lens filing.
  const activeLensForChip = lensList.find((l) => l.id === (scopedLensId ?? chosenLensId));
  const lensChip = activeLensForChip
    ? { label: activeLensForChip.name, color: activeLensForChip.color ?? null }
    : null;

  return (
    <div className="aa-triage">
      {/* ---- Top: close + progress ---- */}
      <TriageProgress
        done={done}
        remaining={remaining}
        onClose={() => navigate("/do/inbox")}
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
            onBodyChange={step === "spec" || isSimpleListDestination ? (title) => setW({ title }) : undefined}
            meta={`captured ${formatAgo(item.createdAt)}`}
            chips={isSimpleListDestination ? [] : triageChips}
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
                selectedLensType={scopedLens?.type ?? "LIFE_AREA"}
                selectedLensName={scopedLens?.name ?? "list"}
                hasAttachments={Boolean(item.attachments?.length)}
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
                  working.type === "delete" || working.type === "list-item"
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

      {/* ---- File-into pickers (Project / Goal / Resource Project) ---- */}
      {!isSimpleListDestination && <TriagePickers
        open={{
          project: projectPickerOpen,
          goal: goalPickerOpen,
          parentProject: parentProjectPickerOpen,
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
      />}
    </div>
  );
}

// ── Presentational sub-components ──────────────────────────────────────────
// Extracted from TriagePage so the orchestrator reads as state + a flat tree.
// Each is presentational: behavior lives in TriagePage, these just render.

const TRIAGE_TYPES = [
  { t: "task", label: "Task", sub: "an action — something to do", Icon: StarIcon },
  { t: "project", label: "Project", sub: "an outcome needing more than one step", Icon: ProjectsIcon },
  { t: "resource", label: "Resource", sub: "a link or reference — not an action", Icon: LogbookIcon },
  { t: "list-item", label: "List item", sub: "a flat item to check off", Icon: BoxIcon },
  { t: "delete", label: "Delete", sub: "get rid of it — not kept", Icon: TrashIcon },
] as const;

type ClassifyLens = { id: string; name: string; color?: string | null; type: "LIFE_AREA" | "SIMPLE_LIST" };

/** Step 1 — pick the type (Task/Project/Resource/Delete) + Lens/Project destination. */
function ClassifyStep({
  working,
  chosenLensId,
  lenses,
  selectedLensType,
  selectedLensName,
  hasAttachments,
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
  selectedLensType: "LIFE_AREA" | "SIMPLE_LIST";
  selectedLensName: string;
  hasAttachments: boolean;
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
          .filter(({ t }) =>
            selectedLensType === "SIMPLE_LIST"
              ? t === "list-item" || t === "delete"
              : t !== "list-item"
          )
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
      {selectedLensType === "SIMPLE_LIST" && (
        <p className="aa-triage-list-note">
          {hasAttachments
            ? `Its image attachments will move with it to ${selectedLensName}.`
            : `No dates, priority, projects, or other setup. This becomes one item in ${selectedLensName}.`}
        </p>
      )}
      <Button
        variant="primary"
        className="aa-triage-step__continue"
        onClick={onContinue}
        disabled={!chosenLensId || !working.title.trim()}
      >
        {working.type === "delete"
          ? "Delete"
          : working.type === "list-item"
            ? `Add to ${selectedLensName}`
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
        2 · {working.type === "task" ? "Specify the task" : working.type === "project" ? "Specify the project" : "File the resource"}
      </div>
      <div className="aa-triage-spec">
        {/* The chip row IS the editor — same component as the task page.
            Project/Goal/Resource Project are external pickers (triage owns those
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

/** The end-of-triage empty state. */
function TriageComplete({ onNavigate }: { onNavigate: NavigateFunction }) {
  return (
    <div className="aa-triage-empty">
      <div className="aa-empty-mark" aria-hidden="true">
        <svg viewBox="0 0 16 16" fill="none">
          <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h2 className="aa-triage-empty__title">Inbox zero.</h2>
      <p className="aa-triage-empty__text">
        Nothing left to decide. Go do something.
      </p>
      <div className="aa-triage-empty__actions">
        <Button variant="primary" onClick={() => onNavigate("/do")}>Done →</Button>
        <Button variant="secondary" onClick={() => onNavigate("/do/inbox")}>Back to inbox</Button>
      </div>
    </div>
  );
}

type PickerProject = { id: string; name: string; goal?: { name: string } | null };
type PickerGoal = { id: string; name: string };

/** File-into pickers for tasks, projects, and project-owned resources. */
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
}: {
  open: { project: boolean; goal: boolean; parentProject: boolean };
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
          title="File resource under a project"
          items={projects.map((p) => ({
            id: p.id,
            label: p.name,
            chip: lensChip,
            meta: p.goal?.name ?? null,
            current: p.id === working?.parentProjectId,
          }))}
          onPick={(id) => {
            setW({ parentProjectId: id });
            setParentProjectOpen(false);
          }}
          onClose={() => setParentProjectOpen(false)}
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

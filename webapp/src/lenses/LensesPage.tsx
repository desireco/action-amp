import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useQuery } from "wasp/client/operations";
import {
  getLenses,
  createLens,
  updateLens,
  deleteLens,
  getAppData,
} from "wasp/client/operations";
import { useEntitled } from "../billing/useEntitled";
import { PRO_LIMITS } from "../billing/config";
import { SettingsLayout } from "../app/SettingsLayout";
import { ProGate, ConfirmDialog } from "../components/ui";
import "./LensesPage.css";

/**
 * Settings → Lenses tab. Pro-only: lists every lens with inline edit (rename /
 * purpose / color), create-at-cap, and delete (CUSTOM only) with a two-mode
 * dialog (hard delete vs. reassign to another lens). FREE users see the shared
 * <ProGate> — they configure nothing.
 *
 * Sort order mirrors getLenses: seeded first (PERSONAL, WORK) then createdAt.
 */
const PALETTE = [
  { key: "indigo", label: "Indigo" },
  { key: "emerald", label: "Emerald" },
  { key: "slate", label: "Slate" },
  { key: "cyan", label: "Cyan" },
  { key: "coral", label: "Coral" },
  { key: "honey", label: "Honey" },
  { key: "lime", label: "Lime" },
  { key: "magenta", label: "Magenta" },
] as const;

type LensRow = {
  id: string;
  name: string;
  kind: string;
  type: "LIFE_AREA" | "SIMPLE_LIST";
  color: string | null;
  purpose: string | null;
  counts: {
    goals: number;
    projects: number;
    tasks: number;
    openItems: number;
    checkedItems: number;
  };
};

function operationErrorMessage(err: unknown, fallback: string): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const e = err as any;
  const data = e?.data ?? e?.response?.data ?? e?.message?.data;
  if (data && typeof data.reason === "string") return data.reason;
  if (typeof e?.message === "string" && e.message.trim()) return e.message;
  return fallback;
}

export function LensesPage() {
  const entitled = useEntitled();
  const queryClient = useQueryClient();
  const { data: lenses, isLoading } = useQuery(getLenses);

  if (!entitled) {
    // FREE: the whole tab is Pro-gated. Calm copy, no list, no edits.
    return (
      <SettingsLayout>
        <ProGate
          feature="Custom lenses"
          reason="Keep one context for work, one for life — or add a Studio, a side project, a board role. Each lens carries its own focus."
          className="aa-lenses-gate"
        />
      </SettingsLayout>
    );
  }

  return (
    <SettingsLayout>
      <LensList lenses={lenses ?? []} isLoading={isLoading} queryClient={queryClient} />
    </SettingsLayout>
  );
}

function LensList({
  lenses,
  isLoading,
  queryClient,
}: {
  lenses: LensRow[];
  isLoading: boolean;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const [creating, setCreating] = useState(false);
  const atCap = lenses.length >= PRO_LIMITS.lenses;

  async function refresh() {
    // getLenses feeds this page; getAppData feeds the sidebar switch + counts.
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["getLenses"] }),
      queryClient.invalidateQueries({ queryKey: ["getAppData"] }),
    ]);
  }

  return (
    <>
      <section className="aa-settings-section">
        <p className="aa-settings-note">
          A lens is one life context — one identity and one focused surface. The two
          defaults can be renamed and recolored but not deleted. Add more on Pro
          (soft cap {PRO_LIMITS.lenses}).
        </p>
      </section>

      <section className="aa-settings-section">
        <h2 className="aa-settings-sh">Your lenses</h2>

        {isLoading ? (
          <p className="aa-lenses-empty">Loading…</p>
        ) : lenses.length === 0 ? (
          <p className="aa-lenses-empty">No lenses yet.</p>
        ) : (
          <div className="aa-lenses-list">
            {lenses.map((lens) => (
              <LensRowItem key={lens.id} lens={lens} allLenses={lenses} onSaved={refresh} />
            ))}
          </div>
        )}

        {creating ? (
          <LensForm
            initial={{ name: "", purpose: "", color: "coral", type: "LIFE_AREA" }}
            allowType
            submit={async (vals) => {
              await createLens(vals);
            }}
            submitLabel="Create lens"
            submittingLabel="Creating…"
            errorPreamble="Couldn't create. Try again."
            namePlaceholder="e.g. Studio, Board, Side project"
            autoFocusName
            onCancel={() => setCreating(false)}
            onDone={async () => {
              setCreating(false);
              await refresh();
            }}
          />
        ) : (
          <button
            type="button"
            className="aa-lenses-add"
            onClick={() => setCreating(true)}
            disabled={atCap}
            title={atCap ? `Soft cap of ${PRO_LIMITS.lenses} lenses reached` : undefined}
          >
            + New lens
          </button>
        )}
        {atCap && !creating && (
          <p className="aa-lenses-cap-note">
            You've reached the soft cap of {PRO_LIMITS.lenses} lenses. Delete one to add another.
          </p>
        )}
      </section>
    </>
  );
}

const KIND_LABEL: Record<string, string> = {
  PERSONAL: "Personal",
  WORK: "Work",
  CUSTOM: "Custom",
};

function LensRowItem({
  lens,
  allLenses,
  onSaved,
}: {
  lens: LensRow;
  allLenses: LensRow[];
  onSaved: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isSeeded = lens.kind !== "CUSTOM";

  if (editing) {
    return (
      <LensForm
        initial={{
          name: lens.name,
          purpose: lens.purpose ?? "",
          color: lens.color ?? "indigo",
          type: lens.type,
        }}
        submit={async ({ type: _type, ...vals }) => {
          await updateLens({ id: lens.id, ...vals });
        }}
        submitLabel="Save"
        submittingLabel="Saving…"
        errorPreamble="Couldn't save. Try again."
        onCancel={() => setEditing(false)}
        onDone={async () => {
          setEditing(false);
          await onSaved();
        }}
      />
    );
  }

  return (
    <>
      <div className="aa-lenses-row" data-lens-color={lens.color || undefined}>
        <span className="aa-lenses-row__dot" aria-hidden="true" />
        <div className="aa-lenses-row__main">
          <div className="aa-lenses-row__name">
            {lens.name}
            <span className="aa-lenses-row__kind">
              {lens.type === "SIMPLE_LIST" ? "Simple list" : KIND_LABEL[lens.kind] ?? lens.kind}
            </span>
          </div>
          {lens.purpose && <div className="aa-lenses-row__purpose">{lens.purpose}</div>}
          {lens.type === "SIMPLE_LIST" ? (
            <div className="aa-lenses-row__meta">
              <span>{lens.counts.openItems} open</span>
              <span>{lens.counts.checkedItems} checked</span>
            </div>
          ) : (
            <div className="aa-lenses-row__meta">
              <span>{lens.counts.goals} goals</span>
              <span>{lens.counts.projects} projects</span>
              <span>{lens.counts.tasks} tasks</span>
            </div>
          )}
        </div>
        <div className="aa-lenses-row__acts">
          <button type="button" className="aa-lenses-act" onClick={() => setEditing(true)}>
            Edit
          </button>
          <button
            type="button"
            className="aa-lenses-act aa-lenses-act--danger"
            onClick={() => setDeleting(true)}
            disabled={isSeeded}
            title={isSeeded ? "Default lenses can't be deleted" : undefined}
          >
            Delete
          </button>
        </div>
      </div>

      {deleting && (
        <DeleteLensDialog
          lens={lens}
          allLenses={allLenses}
          onClose={() => setDeleting(false)}
          onDeleted={async () => {
            setDeleting(false);
            await onSaved();
          }}
        />
      )}
    </>
  );
}

function LensForm({
  initial,
  allowType = false,
  submit,
  submitLabel,
  submittingLabel,
  errorPreamble,
  namePlaceholder,
  autoFocusName,
  onCancel,
  onDone,
}: {
  initial: { name: string; purpose: string; color: string; type: "LIFE_AREA" | "SIMPLE_LIST" };
  allowType?: boolean;
  submit: (vals: { name: string; purpose: string; color: string; type?: "LIFE_AREA" | "SIMPLE_LIST" }) => Promise<void>;
  submitLabel: string;
  submittingLabel: string;
  errorPreamble: string;
  namePlaceholder?: string;
  autoFocusName?: boolean;
  onCancel: () => void;
  onDone: () => Promise<void>;
}) {
  const [name, setName] = useState(initial.name);
  const [purpose, setPurpose] = useState(initial.purpose);
  const [color, setColor] = useState(initial.color);
  const [type, setType] = useState(initial.type);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await submit({ name, purpose, color, ...(allowType ? { type } : {}) });
      await onDone();
    } catch (e) {
      setError(operationErrorMessage(e, errorPreamble));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="aa-lenses-edit" data-lens-color={color || undefined}>
      <div className="aa-lenses-edit__row">
        <label className="aa-lenses-edit__label">Name</label>
        <input
          className="aa-lenses-edit__input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={namePlaceholder}
          disabled={saving}
          autoFocus={autoFocusName}
        />
      </div>
      <fieldset className="aa-lenses-type">
        <legend className="aa-lenses-edit__label">Lens type</legend>
        {allowType ? (
          <div className="aa-lenses-type__options">
            <label className={`aa-lenses-type__option ${type === "LIFE_AREA" ? "selected" : ""}`}>
              <input
                type="radio"
                name="lens-type"
                value="LIFE_AREA"
                checked={type === "LIFE_AREA"}
                onChange={() => setType("LIFE_AREA")}
                disabled={saving}
              />
              <span><strong>Life area</strong><small>Tasks, projects, goals, planning, and review.</small></span>
            </label>
            <label className={`aa-lenses-type__option ${type === "SIMPLE_LIST" ? "selected" : ""}`}>
              <input
                type="radio"
                name="lens-type"
                value="SIMPLE_LIST"
                checked={type === "SIMPLE_LIST"}
                onChange={() => setType("SIMPLE_LIST")}
                disabled={saving}
              />
              <span><strong>Simple list</strong><small>Add items directly and check them off.</small></span>
            </label>
          </div>
        ) : (
          <p className="aa-lenses-type__readonly">
            {type === "SIMPLE_LIST" ? "Simple list" : "Life area"}
            <span>Lens type cannot be changed after creation.</span>
          </p>
        )}
      </fieldset>
      <div className="aa-lenses-edit__row">
        <label className="aa-lenses-edit__label">Purpose</label>
        <input
          className="aa-lenses-edit__input"
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          placeholder="What this lens is for"
          disabled={saving}
        />
      </div>
      <div className="aa-lenses-edit__row">
        <label className="aa-lenses-edit__label">Color</label>
        <div className="aa-lenses-palette">
          {PALETTE.map((p) => (
            <button
              key={p.key}
              type="button"
              className={`aa-lenses-swatch ${color === p.key ? "selected" : ""}`}
              data-lens-color={p.key}
              onClick={() => setColor(p.key)}
              aria-label={p.label}
              title={p.label}
            >
              <span className="aa-lenses-swatch__dot" />
            </button>
          ))}
        </div>
      </div>
      {error && <p className="aa-lenses-error">{error}</p>}
      <div className="aa-lenses-edit__acts">
        <button type="button" className="aa-lenses-act" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button
          type="button"
          className="aa-lenses-act aa-lenses-act--primary"
          onClick={save}
          disabled={saving || !name.trim()}
        >
          {saving ? submittingLabel : submitLabel}
        </button>
      </div>
    </div>
  );
}

function DeleteLensDialog({
  lens,
  allLenses,
  onClose,
  onDeleted,
}: {
  lens: LensRow;
  allLenses: LensRow[];
  onClose: () => void;
  onDeleted: () => Promise<void>;
}) {
  // Fetch the live lens list for the reassign picker. We pass allLenses as a
  // prop from the parent for simplicity, but re-fetch here to be safe against
  // a stale closure (the parent's list could be from before a sibling edit).
  const { data: liveLenses } = useQuery(getLenses);
  const targets = (liveLenses ?? allLenses).filter(
    (candidate) => candidate.id !== lens.id && candidate.type === lens.type,
  );
  const hasContent = lens.type === "SIMPLE_LIST"
    ? lens.counts.openItems + lens.counts.checkedItems > 0
    : lens.counts.goals + lens.counts.projects + lens.counts.tasks > 0;
  const [mode, setMode] = useState<"reassign" | "delete">(hasContent ? "reassign" : "delete");
  const [targetId, setTargetId] = useState(targets[0]?.id ?? "");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const contentSummary = lens.type === "SIMPLE_LIST"
    ? `${lens.counts.openItems} open items, ${lens.counts.checkedItems} checked items`
    : `${lens.counts.goals} goals, ${lens.counts.projects} projects, ${lens.counts.tasks} tasks`;
  const cannotReassign = mode === "reassign" && !targetId;

  useEffect(() => {
    if (targetId || targets.length === 0) return;
    setTargetId(targets[0].id);
  }, [targetId, targets]);

  async function confirm() {
    if (cannotReassign) {
      setError("Choose a lens to move content into.");
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      await deleteLens({
        id: lens.id,
        mode,
        targetLensId: mode === "reassign" ? targetId : undefined,
      });
      await onDeleted();
    } catch (e) {
      setError(operationErrorMessage(e, "Couldn't delete. Try again."));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <ConfirmDialog
      title={`Delete the "${lens.name}" lens`}
      message={
        <div className="aa-lenses-delete">
          {hasContent ? (
            <>
              <p>This lens has <strong>{contentSummary}</strong>. Choose what happens to them:</p>
              <label className="aa-lenses-delete__opt">
                <input
                  type="radio"
                  name="delete-mode"
                  checked={mode === "reassign"}
                  onChange={() => setMode("reassign")}
                  disabled={deleting}
                />
                <span>
                  <strong>Move to another lens</strong>
                  <select
                    className="aa-lenses-delete__select"
                    value={targetId}
                    onChange={(e) => setTargetId(e.target.value)}
                    disabled={deleting || mode !== "reassign" || targets.length === 0}
                  >
                    {targets.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </span>
              </label>
              {targets.length === 0 && (
                <p>
                  Create another {lens.type === "SIMPLE_LIST" ? "Simple list" : "Life area"}
                  {" "}first, or empty this lens before deleting it.
                </p>
              )}
            </>
          ) : (
            <p>This lens is empty. Deleting it removes only the lens itself.</p>
          )}
          {error && <p className="aa-lenses-error">{error}</p>}
        </div>
      }
      confirmLabel={deleting ? "Deleting…" : `Delete ${lens.name}`}
      cancelLabel="Cancel"
      danger
      confirmDisabled={deleting || cannotReassign}
      onConfirm={confirm}
      onClose={onClose}
    />
  );
}

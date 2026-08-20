import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "wasp/client/operations";
import {
  clearCompletedListItems,
  createListItem,
  deleteListItem,
  getSimpleList,
  renameListItem,
  setListItemDone,
} from "wasp/client/operations";
import type { ListItem } from "@prisma/client";
import { AttachmentThumbs, ConfirmDialog, Linkify } from "../components/ui";
import "./SimpleListPage.css";

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement &&
    (target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT");
}

function safeSourceUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * The checklist body of a Simple-list Project — everything below the page's
 * own header/breadcrumb (add form, Open/Checked sections, clear-checked,
 * n/j/k/space/e/Delete keys). Extracted from the old `/do/list` page when
 * simple lists moved from Lens type to Project type (2026-08-18).
 */
export function SimpleListChecklist({ projectId }: { projectId: string }) {
  const addInput = useRef<HTMLInputElement>(null);
  const refocusAfterAdd = useRef(false);
  const [text, setText] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const { data, isLoading, error: queryError } = useQuery(
    getSimpleList,
    { projectId },
  );

  // SAFETY: type assertion is safe — value is validated or from a trusted source.
  const items = (data ?? []) as ListItemWithAttachments[];
  const open = useMemo(() => items.filter((item) => !item.isDone), [items]);
  const checked = useMemo(() => items.filter((item) => item.isDone), [items]);
  const ordered = useMemo(() => [...open, ...checked], [open, checked]);

  useEffect(() => {
    if (ordered.length === 0) setSelectedId(null);
    else if (!selectedId || !ordered.some((item) => item.id === selectedId)) {
      setSelectedId(ordered[0].id);
    }
  }, [ordered, selectedId]);

  async function mutate<T>(key: string, action: () => Promise<T>): Promise<void> {
    setSaving(key);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(errorMessage(cause, "Couldn't save that change. Try again."));
    } finally {
      setSaving(null);
    }
  }

  async function addItem() {
    if (!text.trim()) return;
    refocusAfterAdd.current = true;
    await mutate("add", async () => {
      await createListItem({ projectId, text });
      setText("");
    });
  }

  useEffect(() => {
    if (saving !== null || !refocusAfterAdd.current) return;
    refocusAfterAdd.current = false;
    addInput.current?.focus();
  }, [saving]);

  function beginEdit(item: ListItem) {
    setSelectedId(item.id);
    setEditingId(item.id);
    setEditText(item.text);
  }

  async function finishEdit(item: ListItem) {
    if (!editText.trim()) return;
    await mutate(item.id, async () => {
      await renameListItem({ id: item.id, text: editText });
      setEditingId(null);
    });
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isTyping(event.target) || confirmClear || saving) return;
      if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        addInput.current?.focus();
        return;
      }
      const index = ordered.findIndex((item) => item.id === selectedId);
      if (event.key.toLowerCase() === "j" || event.key.toLowerCase() === "k") {
        event.preventDefault();
        const delta = event.key.toLowerCase() === "j" ? 1 : -1;
        const next = Math.max(0, Math.min(ordered.length - 1, (index < 0 ? 0 : index) + delta));
        setSelectedId(ordered[next]?.id ?? null);
      } else if ((event.key === " " || event.code === "Space") && index >= 0) {
        event.preventDefault();
        const item = ordered[index];
        void mutate(item.id, () => setListItemDone({ id: item.id, isDone: !item.isDone }));
      } else if (event.key.toLowerCase() === "e" && index >= 0) {
        event.preventDefault();
        beginEdit(ordered[index]);
      } else if ((event.key === "Delete" || event.key === "Backspace") && index >= 0) {
        event.preventDefault();
        void mutate(ordered[index].id, () => deleteListItem({ id: ordered[index].id }));
      } else if (event.key === "Escape") {
        setEditingId(null);
        setSelectedId(null);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirmClear, ordered, saving, selectedId]);

  return (
    <section className="aa-simple-list aa-simple-list--project">
      <form className="aa-simple-list__add" onSubmit={(event) => { event.preventDefault(); void addItem(); }}>
        <input
          ref={addInput}
          aria-label="Add an item"
          placeholder="Add an item…"
          value={text}
          onChange={(event) => setText(event.target.value)}
          disabled={saving === "add"}
        />
        <button type="submit" disabled={!text.trim() || saving === "add"}>
          {saving === "add" ? "Adding…" : "Add"}
        </button>
      </form>

      {(error || queryError) && (
        <p className="aa-simple-list__error" role="alert">
          {error ?? errorMessage(queryError, "Couldn't load this list.")}
        </p>
      )}

      {isLoading ? (
        <div className="aa-simple-list__loading" aria-label="Loading list">
          <span /><span /><span />
        </div>
      ) : items.length === 0 ? (
        <div className="aa-simple-list__empty">
          <h2>List clear.</h2>
          <p>Add the first thing you want to remember.</p>
        </div>
      ) : (
        <>
          <ListSection
            label="Open"
            items={open}
            selectedId={selectedId}
            editingId={editingId}
            editText={editText}
            saving={saving}
            onSelect={setSelectedId}
            onToggle={(item) => void mutate(item.id, () => setListItemDone({ id: item.id, isDone: !item.isDone }))}
            onBeginEdit={beginEdit}
            onEditText={setEditText}
            onFinishEdit={(item) => void finishEdit(item)}
            onCancelEdit={() => setEditingId(null)}
            onDelete={(item) => void mutate(item.id, () => deleteListItem({ id: item.id }))}
          />
          {checked.length > 0 && (
            <ListSection
              label={`Checked ${checked.length}`}
              items={checked}
              selectedId={selectedId}
              editingId={editingId}
              editText={editText}
              saving={saving}
              onSelect={setSelectedId}
              onToggle={(item) => void mutate(item.id, () => setListItemDone({ id: item.id, isDone: !item.isDone }))}
              onBeginEdit={beginEdit}
              onEditText={setEditText}
              onFinishEdit={(item) => void finishEdit(item)}
              onCancelEdit={() => setEditingId(null)}
              onDelete={(item) => void mutate(item.id, () => deleteListItem({ id: item.id }))}
            />
          )}
          {checked.length > 0 && (
            <button className="aa-simple-list__clear" type="button" onClick={() => setConfirmClear(true)}>
              Clear checked
            </button>
          )}
        </>
      )}

      {confirmClear && (
        <ConfirmDialog
          title="Clear checked items?"
          message={`Permanently remove ${checked.length} checked ${checked.length === 1 ? "item" : "items"}.`}
          confirmLabel={saving === "clear" ? "Clearing…" : "Clear checked"}
          cancelLabel="Keep them"
          danger
          confirmDisabled={saving === "clear"}
          onClose={() => setConfirmClear(false)}
          onConfirm={() => void mutate("clear", async () => {
            await clearCompletedListItems({ projectId });
            setConfirmClear(false);
          })}
        />
      )}
    </section>
  );
}

type ListItemWithAttachments = ListItem & {
  attachments: { id: string; filename: string; mimeType: string }[];
};

type ListSectionProps = {
  label: string;
  items: ListItemWithAttachments[];
  selectedId: string | null;
  editingId: string | null;
  editText: string;
  saving: string | null;
  onSelect: (id: string) => void;
  onToggle: (item: ListItemWithAttachments) => void;
  onBeginEdit: (item: ListItemWithAttachments) => void;
  onEditText: (value: string) => void;
  onFinishEdit: (item: ListItemWithAttachments) => void;
  onCancelEdit: () => void;
  onDelete: (item: ListItemWithAttachments) => void;
};

function ListSection(props: ListSectionProps) {
  if (props.items.length === 0) return null;
  return (
    <div className="aa-simple-list__section">
      <h2>{props.label}</h2>
      <ul>
        {props.items.map((item) => {
          const sourceUrl = safeSourceUrl(item.sourceUrl);
          return (
          <li
            key={item.id}
            className={`${props.selectedId === item.id ? "selected" : ""}${item.isDone ? " is-done" : ""}`}
            onClick={() => props.onSelect(item.id)}
          >
            <input
              type="checkbox"
              aria-label={`${item.isDone ? "Reopen" : "Check"} ${item.text}`}
              checked={item.isDone}
              disabled={props.saving === item.id}
              onChange={() => props.onToggle(item)}
            />
            {props.editingId === item.id ? (
              <input
                className="aa-simple-list__rename"
                aria-label={`Rename ${item.text}`}
                value={props.editText}
                onChange={(event) => props.onEditText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") props.onFinishEdit(item);
                  if (event.key === "Escape") props.onCancelEdit();
                }}
                autoFocus
              />
            ) : (
              <div className="aa-simple-list__body">
                {/* role=button (not a <button>) so linkified URLs inside stay
                    real anchors — clicks on them open the link instead of
                    entering rename; everything else edits. */}
                <div
                  className="aa-simple-list__title"
                  role="button"
                  tabIndex={0}
                  onClick={(event) => {
                    // A click on a linkified URL opens the link, not the editor.
                    if (event.target instanceof HTMLElement && event.target.closest("a")) return;
                    props.onBeginEdit(item);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      props.onBeginEdit(item);
                    }
                  }}
                >
                  <Linkify text={item.text} />
                </div>
                {(item.content || sourceUrl || item.attachments.length > 0) && (
                  <div className="aa-simple-list__context">
                    {item.content && <p><Linkify text={item.content} /></p>}
                    {sourceUrl && (
                      <a
                        href={sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(event) => event.stopPropagation()}
                      >
                        Open source
                      </a>
                    )}
                    {item.attachments.length > 0 && (
                      <div onClick={(event) => event.stopPropagation()}>
                        <AttachmentThumbs attachments={item.attachments} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            <button
              className="aa-simple-list__remove"
              type="button"
              aria-label={`Remove ${item.text}`}
              disabled={props.saving === item.id}
              onClick={() => props.onDelete(item)}
            >
              Remove
            </button>
          </li>
          );
        })}
      </ul>
    </div>
  );
}

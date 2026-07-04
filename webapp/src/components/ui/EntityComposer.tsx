import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Button } from "./Button";
import "./EntityComposer.css";

interface EntityComposerProps {
  title: string;
  subtitle?: string;
  nameLabel: string;
  namePlaceholder: string;
  submitLabel: string;
  descriptionLabel?: string;
  descriptionPlaceholder?: string;
  initialName?: string;
  submitting: boolean;
  onCreate: (name: string, description?: string) => Promise<void> | void;
  onCancel: () => void;
}

/**
 * EntityComposer — small raised create surface for named app objects. Supports
 * an optional description field for entities that carry a "why" note.
 */
export function EntityComposer({
  title,
  subtitle,
  nameLabel,
  namePlaceholder,
  submitLabel,
  descriptionLabel,
  descriptionPlaceholder,
  initialName = "",
  submitting,
  onCreate,
  onCancel,
}: EntityComposerProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState("");
  const canSubmit = !!name.trim() && !submitting;
  const hasDescription = !!descriptionLabel;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || submitting) return;

    const trimmedDescription = hasDescription ? description.trim() : "";
    await onCreate(trimmedName, trimmedDescription || undefined);
    setName("");
    setDescription("");
  };

  const submitFromTextarea = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      formRef.current?.requestSubmit();
    }
  };

  return (
    <form ref={formRef} className="aa-entity-composer" onSubmit={submit}>
      <div className="aa-entity-composer__head">
        <div>
          <h2 className="aa-entity-composer__title">{title}</h2>
          {subtitle && <p className="aa-entity-composer__sub">{subtitle}</p>}
        </div>
      </div>

      <label className="aa-entity-composer__field">
        <span className="aa-entity-composer__label">{nameLabel}</span>
        <input
          className="aa-entity-composer__input"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={namePlaceholder}
          autoFocus
        />
      </label>

      {hasDescription && (
        <label className="aa-entity-composer__field">
          <span className="aa-entity-composer__label">{descriptionLabel}</span>
          <textarea
            className="aa-entity-composer__textarea"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            onKeyDown={submitFromTextarea}
            placeholder={descriptionPlaceholder}
            rows={3}
          />
        </label>
      )}

      <div className="aa-entity-composer__actions">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={!canSubmit}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

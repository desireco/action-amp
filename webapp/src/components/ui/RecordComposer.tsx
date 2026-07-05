import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Button } from "./Button";
import "./RecordComposer.css";

interface RecordComposerProps {
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
 * RecordComposer — small raised create surface for named app objects. Supports
 * an optional description field for records that carry a "why" note.
 */
export function RecordComposer({
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
}: RecordComposerProps) {
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
    <form ref={formRef} className="aa-record-composer" onSubmit={submit}>
      <div className="aa-record-composer__head">
        <div>
          <h2 className="aa-record-composer__title">{title}</h2>
          {subtitle && <p className="aa-record-composer__sub">{subtitle}</p>}
        </div>
      </div>

      <label className="aa-record-composer__field">
        <span className="aa-record-composer__label">{nameLabel}</span>
        <input
          className="aa-record-composer__input"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={namePlaceholder}
          autoFocus
        />
      </label>

      {hasDescription && (
        <label className="aa-record-composer__field">
          <span className="aa-record-composer__label">{descriptionLabel}</span>
          <textarea
            className="aa-record-composer__textarea"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            onKeyDown={submitFromTextarea}
            placeholder={descriptionPlaceholder}
            rows={3}
          />
        </label>
      )}

      <div className="aa-record-composer__actions">
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

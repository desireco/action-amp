import { useState, type FormEvent } from "react";
import { Button } from "../components/ui";
import "./CreateInline.css";

/**
 * CreateInline — a compact inline form that appears when the user clicks
 * "New project" / "New goal". Single text input + Create/Cancel. Submits via
 * the provided onCreate; the parent handles the mutation + cache invalidation.
 */
export function CreateInline({
  placeholder,
  onCreate,
  onCancel,
  submitting = false,
  initialValue = "",
}: {
  placeholder: string;
  onCreate: (name: string) => Promise<void> | void;
  onCancel: () => void;
  submitting?: boolean;
  initialValue?: string;
}) {
  const [name, setName] = useState(initialValue);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || submitting) return;
    await onCreate(trimmed);
    setName("");
  };

  return (
    <form className="aa-create-inline" onSubmit={submit}>
      <input
        type="text"
        className="aa-create-inline__input"
        placeholder={placeholder}
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
        aria-label={placeholder}
      />
      <Button type="submit" size="sm" disabled={submitting || !name.trim()}>
        Create
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
        Cancel
      </Button>
    </form>
  );
}

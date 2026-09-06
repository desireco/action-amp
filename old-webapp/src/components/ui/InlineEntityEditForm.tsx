import { Button } from "./Button";
import "./InlineEntityEditForm.css";

interface InlineEntityEditFormProps {
  title: string;
  subtitle: string;
  nameLabel: string;
  name: string;
  namePlaceholder: string;
  descriptionLabel: string;
  description: string;
  descriptionPlaceholder: string;
  error?: string | null;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
}

/**
 * InlineEntityEditForm — raised in-place edit surface for named app objects.
 */
export function InlineEntityEditForm({
  title,
  subtitle,
  nameLabel,
  name,
  namePlaceholder,
  descriptionLabel,
  description,
  descriptionPlaceholder,
  error,
  onNameChange,
  onDescriptionChange,
  onCancel,
  onSave,
}: InlineEntityEditFormProps) {
  return (
    <div className="aa-inline-edit">
      <div className="aa-inline-edit__head">
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
      <label className="aa-inline-edit__field">
        <span>{nameLabel}</span>
        <input
          className="aa-inline-edit__name"
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder={namePlaceholder}
        />
      </label>
      <label className="aa-inline-edit__field">
        <span>{descriptionLabel}</span>
        <textarea
          className="aa-inline-edit__desc"
          value={description}
          onChange={(event) => onDescriptionChange(event.target.value)}
          placeholder={descriptionPlaceholder}
          rows={3}
        />
      </label>
      {error && <p className="aa-inline-edit__err">{error}</p>}
      <div className="aa-inline-edit__actions">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" onClick={onSave}>
          Save changes
        </Button>
      </div>
    </div>
  );
}

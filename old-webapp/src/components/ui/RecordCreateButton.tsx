import type { ComponentType, SVGProps } from "react";
import { Button } from "./Button";
import { PlusIcon } from "./icons";
import "./RecordCreateButton.css";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

interface RecordCreateButtonProps {
  label: string;
  icon: IconComponent;
  onClick: () => void;
  className?: string;
}

/**
 * RecordCreateButton — prominent create affordance for first-class objects
 * such as Projects and Goals.
 */
export function RecordCreateButton({
  label,
  icon: Icon,
  onClick,
  className = "",
}: RecordCreateButtonProps) {
  return (
    <Button
      variant="secondary"
      className={["aa-record-create", className].filter(Boolean).join(" ")}
      icon={
        <span className="aa-record-create__mark" aria-hidden="true">
          <Icon className="aa-record-create__icon" />
          <PlusIcon className="aa-record-create__plus" />
        </span>
      }
      onClick={onClick}
    >
      {label}
    </Button>
  );
}

import type { ComponentType, SVGProps } from "react";
import { Button } from "./Button";
import { PlusIcon } from "./icons";
import "./EntityCreateButton.css";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

interface EntityCreateButtonProps {
  label: string;
  icon: IconComponent;
  onClick: () => void;
  className?: string;
}

/**
 * EntityCreateButton — prominent create affordance for first-class objects
 * such as Projects and Goals.
 */
export function EntityCreateButton({
  label,
  icon: Icon,
  onClick,
  className = "",
}: EntityCreateButtonProps) {
  return (
    <Button
      variant="secondary"
      className={["aa-entity-create", className].filter(Boolean).join(" ")}
      icon={
        <span className="aa-entity-create__mark" aria-hidden="true">
          <Icon className="aa-entity-create__icon" />
          <PlusIcon className="aa-entity-create__plus" />
        </span>
      }
      onClick={onClick}
    >
      {label}
    </Button>
  );
}

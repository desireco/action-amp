import type { ComponentType, SVGProps } from "react";
import { Chip } from "./Chip";
import { ProGate } from "./ProGate";
import { RecordCreateButton } from "./RecordCreateButton";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

/**
 * Shared create-affordance + FREE-cap display for record lists (Goals,
 * Projects). Encapsulates the three states both list pages share:
 *
 *  - creating → render nothing (the composer takes over)
 *  - FREE user at cap → render a ProGate trigger as the quiet upgrade path
 *  - otherwise → render the normal RecordCreateButton
 *
 * The onClick handler decides: an empty list opens the composer (no toggle);
 * a populated list toggles. Both list pages had this identical branch inline.
 */
interface RecordCreateControlProps {
  label: string;
  icon: IconComponent;
  /** ProGate surfaces this as the feature name + the reason-to-upgrade line. */
  upgradeFeature: string;
  upgradeReason: string;
  /** True while the create composer is open (suppresses the control). */
  creating: boolean;
  /** True when the FREE user has reached the cap; switches to ProGate. */
  atCap: boolean;
  /** True when the list itself is empty (open composer instead of toggle). */
  empty: boolean;
  /**
   * Called when the create button is clicked. Receives the would-be-next
   * state so consumers don't re-derive the empty/toggle branch themselves:
   * `empty` lists always pass `true`; populated lists flip the current state.
   */
  onToggleCreating: (next: boolean) => void;
}

export function RecordCreateControl({
  label,
  icon,
  upgradeFeature,
  upgradeReason,
  creating,
  atCap,
  empty,
  onToggleCreating,
}: RecordCreateControlProps) {
  if (creating) return null;
  if (atCap) {
    return (
      <ProGate asTrigger feature={upgradeFeature} reason={upgradeReason}>
        <span className="aa-progate-trigger__label">{label}</span>
        <span className="aa-progate-trigger__cta">Upgrade →</span>
      </ProGate>
    );
  }
  return (
    <RecordCreateButton
      label={label}
      icon={icon}
      onClick={() => {
        if (empty) onToggleCreating(true);
        else onToggleCreating(!creating);
      }}
    />
  );
}

/**
 * AllowanceChip — the "N of M used" hint for FREE users below the cap. PRO
 * users and FREE users at/over the cap see nothing (the ProGate covers the
 * at-cap case). Reads as calm, not as a guilt counter.
 */
export function AllowanceChip({
  entitled,
  atCap,
  used,
  cap,
}: {
  entitled: boolean;
  atCap: boolean;
  used: number;
  cap: number;
}) {
  if (entitled || atCap) return null;
  return (
    <Chip variant="muted" small>
      {used} of {cap} used
    </Chip>
  );
}

import { useEffect } from "react";
import type { ChosenType, Step, Working } from "./triageFlow";

interface UseTriageKeyboardArgs {
  isComplete: boolean;
  hasItem: boolean;
  step: Step;
  chosenLensId: string | null;
  working: Working | null;
  /** Whether any PropertyChips popover or picker sheet is open. While true,
   *  the property-key shortcuts are suppressed (don't cycle size with "]" while
   *  the size popover is open) — Escape still closes it. */
  chipOpen: boolean;
  pickerOpen: boolean;
  canComplete: (working: Working | null) => boolean;
  dispatch: () => void;
  navigateToInbox: () => void;
  setChipOpen: (open: boolean) => void;
  setStep: (step: Step) => void;
  setWorkingType: (type: ChosenType) => void;
  selectLensByIndex: (index: number) => void;
  /** Apply a property-key patch (size/priority/when) to the working draft.
   *  Called from the spec step when [ / ] / - / = / H are pressed. */
  applyPropertyKey: (patch: Partial<Working>) => void;
}

const SIZE_ORDER = ["S", "M", "L", "XL"] as const;
const PRIORITY_ORDER = ["LOW", "NORMAL", "IMPORTANT"] as const;
const WHEN_ORDER = ["Today", "Upcoming", "Someday"] as const;

function cycleValue<T extends string>(
  value: T,
  order: readonly T[],
  step: 1 | -1,
): T {
  const idx = order.indexOf(value);
  if (idx === -1) return order[0];
  return order[(idx + step + order.length) % order.length];
}

export function useTriageKeyboard({
  isComplete,
  hasItem,
  step,
  chosenLensId,
  working,
  chipOpen,
  pickerOpen,
  canComplete,
  dispatch,
  navigateToInbox,
  setChipOpen,
  setStep,
  setWorkingType,
  selectLensByIndex,
  applyPropertyKey,
}: UseTriageKeyboardArgs) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isComplete || !hasItem) return;

      // While a chip popover OR bottom-sheet picker is open: only Escape closes
      // it (PropertyChips handles its own Escape for popovers; the pickers
      // handle theirs). Property-key cycling is suppressed here.
      if (chipOpen || pickerOpen) {
        if (e.key === "Escape") {
          setChipOpen(false);
        }
        return;
      }

      if (e.key === "Escape") {
        if (step === "classify") navigateToInbox();
        else setStep("classify");
        return;
      }

      const editingTitle =
        document.activeElement?.getAttribute("contenteditable") === "true" ||
        isTypingTarget(document.activeElement);
      if (editingTitle) return;

      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // ---- Spec step: property keys (TRIAGE.md §7.4 / §7.6) ----
      // [ / ] size, - / = priority, H cycle when. Only meaningful for tasks
      // (size/priority/when are task fields); ignored for project/resource.
      if (step === "spec" && working?.type === "task") {
        const w = working;
        switch (e.key) {
          case "[":
            e.preventDefault();
            applyPropertyKey({
              size: cycleValue(w.size, SIZE_ORDER, -1),
            });
            return;
          case "]":
            e.preventDefault();
            applyPropertyKey({
              size: cycleValue(w.size, SIZE_ORDER, 1),
            });
            return;
          case "-":
            e.preventDefault();
            applyPropertyKey({
              priority: cycleValue(w.priority, PRIORITY_ORDER, -1),
            });
            return;
          case "=":
          case "+":
            e.preventDefault();
            applyPropertyKey({
              priority: cycleValue(w.priority, PRIORITY_ORDER, 1),
            });
            return;
          case "h":
          case "H":
            e.preventDefault();
            applyPropertyKey({
              when: cycleValue(w.when, WHEN_ORDER, 1),
            });
            return;
        }
      }

      if (step === "classify") {
        const typeByKey: Record<string, ChosenType> = {
          "1": "task",
          "2": "project",
          "3": "resource",
          "4": "delete",
        };
        const lensIndexByKey: Record<string, number> = {
          a: 0,
          s: 1,
          d: 2,
          f: 3,
        };
        const type = typeByKey[e.key];
        if (type) {
          e.preventDefault();
          setWorkingType(type);
          return;
        }
        if (e.key === "Backspace" || e.key === "Delete") {
          e.preventDefault();
          setWorkingType("archive");
          return;
        }
        const lensIndex = lensIndexByKey[e.key.toLowerCase()];
        if (lensIndex !== undefined) {
          e.preventDefault();
          selectLensByIndex(lensIndex);
          return;
        }
      }

      if (e.key !== "Enter") return;

      e.preventDefault();
      if (step === "classify" && chosenLensId && working) {
        if (working.type === "archive") {
          dispatch();
        } else {
          setStep("spec");
        }
      } else if (step === "spec" && canComplete(working)) {
        dispatch();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    isComplete,
    hasItem,
    step,
    chosenLensId,
    working,
    chipOpen,
    pickerOpen,
    canComplete,
    dispatch,
    navigateToInbox,
    setChipOpen,
    setStep,
    setWorkingType,
    selectLensByIndex,
    applyPropertyKey,
  ]);
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable
  );
}

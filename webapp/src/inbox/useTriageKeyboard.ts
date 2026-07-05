import { useEffect } from "react";
import type { ChosenType, Step, Working } from "./triageFlow";

interface UseTriageKeyboardArgs {
  isComplete: boolean;
  hasItem: boolean;
  step: Step;
  chosenLensId: string | null;
  working: Working | null;
  openKey: string | null;
  pickerOpen: boolean;
  canComplete: (working: Working | null) => boolean;
  dispatch: () => void;
  navigateToInbox: () => void;
  setOpenKey: (key: string | null) => void;
  setStep: (step: Step) => void;
  setWorkingType: (type: ChosenType) => void;
  selectLensByIndex: (index: number) => void;
}

export function useTriageKeyboard({
  isComplete,
  hasItem,
  step,
  chosenLensId,
  working,
  openKey,
  pickerOpen,
  canComplete,
  dispatch,
  navigateToInbox,
  setOpenKey,
  setStep,
  setWorkingType,
  selectLensByIndex,
}: UseTriageKeyboardArgs) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isComplete || !hasItem) return;

      if (openKey || pickerOpen) {
        if (e.key === "Escape") {
          setOpenKey(null);
        }
        return;
      }

      if (e.key === "Escape") {
        if (step === "classify") navigateToInbox();
        else setStep("classify");
        return;
      }

      const editingTitle = document.activeElement?.getAttribute("contenteditable") === "true";
      if (editingTitle) return;

      if (step === "classify") {
        const typeByKey: Record<string, ChosenType> = {
          "1": "task",
          "2": "project",
          "3": "resource",
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
    openKey,
    pickerOpen,
    canComplete,
    dispatch,
    navigateToInbox,
    setOpenKey,
    setStep,
    setWorkingType,
    selectLensByIndex,
  ]);
}

import { useEffect } from "react";
import type { Step, Working } from "./triageFlow";

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
        if (step === "lens") navigateToInbox();
        else setStep(step === "spec" ? "type" : "lens");
        return;
      }

      if (e.key !== "Enter") return;
      const editingTitle = document.activeElement?.getAttribute("contenteditable") === "true";
      if (editingTitle) return;

      e.preventDefault();
      if (step === "lens" && chosenLensId) {
        setStep("type");
      } else if (step === "type" && working) {
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
  ]);
}

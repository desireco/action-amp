export interface KeyActions {
  openCapture(): void;
  move(delta: 1 | -1): void;
  keep(): void;
  dismiss(): void;
  tag(): void;
  escape(): void;
}

/** The triage keymap: ⌘K capture · j/k move · K keep · D dismiss · T tag · Esc. */
export function createKeyHandler(actions: KeyActions) {
  return (event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      actions.openCapture();
      return;
    }
    if (event.target instanceof HTMLInputElement) return;
    if (event.key === "Escape") {
      actions.escape();
      return;
    }
    if (event.key === "j") actions.move(1);
    if (event.key === "k") actions.move(-1);
    if (event.key === "K") actions.keep();
    if (event.key === "D") actions.dismiss();
    if (event.key === "T") actions.tag();
  };
}

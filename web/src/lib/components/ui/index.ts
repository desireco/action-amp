/**
 * ui/ — the consolidated design-system primitives for the new stack.
 *
 * Mirror of the legacy app's `webapp/src/components/ui/` organization: one
 * role per component, colocated CSS ported verbatim from the webapp sources,
 * all token-based (see docs/DESIGN-SYSTEM.md + src/lib/tokens.css). Slices
 * consume primitives from this folder — never hand-rolled duplicates.
 *
 * Screen-specific components (WhatNow, FocusView, TaskRow, the slice view
 * folders) stay in their own folders; only shared primitives live here.
 */
export { default as Button } from "./Button.svelte";
export { default as BottomSheet } from "./BottomSheet.svelte";
export { default as Card } from "./Card.svelte";
export { default as Chip } from "./Chip.svelte";
export { default as CloseButton } from "./CloseButton.svelte";
export { default as CompletionCircle } from "./CompletionCircle.svelte";
export { default as ConfirmDialog } from "./ConfirmDialog.svelte";
export { default as CountLinkButton } from "./CountLinkButton.svelte";
export { default as GroupedList } from "./GroupedList.svelte";
export { default as Icon } from "./Icon.svelte";
export { default as Linkify } from "./Linkify.svelte";
export { default as ListEmpty } from "./ListEmpty.svelte";
export { default as PickerSheet } from "./PickerSheet.svelte";
export { default as ProGate } from "./ProGate.svelte";
export { default as PropertyChips } from "./PropertyChips.svelte";

/**
 * Measure the pixel coordinates of the caret inside a textarea.
 *
 * Uses the mirror-div technique (same approach as the `textarea-caret-position`
 * npm package): clone the textarea's box-model + typography into a hidden div,
 * mirror the text up to the caret, insert a span marker, and measure the
 * marker's position. The result is relative to the textarea's content box
 * (top-left = 0,0), so the caller adds the textarea's own offset to anchor a
 * dropdown in viewport space.
 *
 * Why hand-rolled: the codebase has no floating-ui/popper dependency, and the
 * algorithm is ~40 lines. Mobile (iOS) may need extra tuning — defer per the
 * spec's out-of-scope note.
 */

// Style properties copied from textarea → mirror div. Anything that affects
// text layout must match exactly or the caret position drifts.
const COPY_PROPS = [
  "boxSizing", "width", "height",
  "overflowX", "overflowY",
  "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
  "borderStyle", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
  "fontStyle", "fontVariant", "fontWeight", "fontStretch", "fontSize", "fontSizeAdjust",
  "lineHeight", "fontFamily",
  "textAlign", "textTransform", "textIndent", "textDecoration",
  "letterSpacing", "wordSpacing", "whiteSpace", "wordBreak", "tabSize",
] as const;

export interface CaretCoords {
  top: number;
  left: number;
  /** Absolute height of a line — useful for positioning below the caret. */
  lineHeight: number;
}

export function getCaretCoordinates(
  textarea: HTMLTextAreaElement,
  caretIndex: number,
): CaretCoords {
  const div = document.createElement("div");
  const style = window.getComputedStyle(textarea);
  for (const prop of COPY_PROPS) {
    // `as any` on the prop key: COPY_PROPS names are valid CSS props, but TS's
    // DOM CSSStyleDeclaration index signature is conservative. Same tradeoff
    // the upstream package makes.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    // SAFETY: double/wide assertion needed — runtime shape is verified.
    (div.style as any)[prop] = (style as any)[prop];
  }
  // Force a known layout regardless of the textarea's own constraints.
  div.style.position = "absolute";
  div.style.visibility = "hidden";
  div.style.whiteSpace = "pre-wrap";
  div.style.wordWrap = "break-word";

  // Mirror the text up to the caret. Handle the textarea's wrap + scroll.
  const text = textarea.value.slice(0, caretIndex);
  div.textContent = text;

  // The marker span sits at the caret's position; measuring its offset
  // relative to the div gives us the caret coordinate.
  const marker = document.createElement("span");
  marker.textContent = "\u200b"; // zero-width space — has layout but no width
  div.appendChild(marker);

  document.body.appendChild(div);
  // The marker offset is relative to the hidden mirror's padding box, which is
  // the coordinate system the caller needs before adding the real textarea's
  // card-relative offset. Subtract textarea scroll so the dropdown follows the
  // visible caret when the textarea has scrolled internally.
  const top = marker.offsetTop - textarea.scrollTop;
  const left = marker.offsetLeft - textarea.scrollLeft;
  const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;

  document.body.removeChild(div);

  return { top, left, lineHeight };
}

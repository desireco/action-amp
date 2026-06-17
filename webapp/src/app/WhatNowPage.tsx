import "./WhatNowPage.css";

/**
 * The home screen — "What Now". The product's wedge: not a list, a chooser.
 *
 * The shell (sidebar chrome) is rendered once by the root App component, so
 * this page renders only its content.
 *
 * This is the empty state. The focus engine (priority → size → due, scoped to
 * the active Lens) lands here once Tasks exist. For now there's nothing to do,
 * so we say so — calmly, no nagging.
 */
export function WhatNowPage() {
  return (
    <div className="aa-wn">
      <div className="aa-wn-eyebrow">What now</div>
      <h1 className="aa-wn-empty">Nothing on the table.</h1>
      <p className="aa-wn-empty-sub">
        You haven't added anything yet. When you do, ActionAmp will pick the one
        thing to do next — and hide the rest.
      </p>
    </div>
  );
}

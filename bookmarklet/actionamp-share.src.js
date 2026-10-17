/**
 * ActionAmp inbox bookmarklet — readable source.
 *
 * Install from bookmarklet/install.html (drag the link to the bookmarks
 * bar), or paste the one-liner there into a new bookmark's URL field.
 *
 * Collects the page title, URL, and any text selection, then opens the
 * ActionAmp share review page (?title=&text=&url=) in a new tab. It is the
 * same review page the PWA share target uses — nothing is captured until
 * you confirm there, and the write goes through the normal authenticated
 * ops. A cross-origin POST can't work here (SameSite cookies + CORS), so
 * the review-page handoff is the whole mechanism.
 *
 * shortcut: fields truncate at 2000 chars, the app's field cap — a longer
 * selection gets cut; upgrade if long-excerpt captures matter (#21 README).
 */
(() => {
  const APP = "https://app.actionamp.com"; // dev twin: http://localhost:5174
  const CAP = 2000;

  const params = new URLSearchParams();
  params.set("title", document.title.trim().slice(0, CAP));
  params.set("url", location.href);
  const selection = String(getSelection()).trim();
  if (selection) params.set("text", selection.slice(0, CAP));

  window.open(`${APP}/share?${params}`);
})();

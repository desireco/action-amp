import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useQuery } from "wasp/client/operations";
import { useQueryClient } from "@tanstack/react-query";
import type { ParsedCapture } from "../inbox/parseCapture";
import { ParsedCaptureChips } from "../components/ui/CapturePopover";
// Note: the query function is imported from the generated "wasp/client/operations"
// entry, not the source file — same pattern as InboxPage.tsx importing getInboxItems.
import { getInboxItem } from "wasp/client/operations";
import "./SharePage.css";

// /share — the PWA share_target confirmation page. Shapes:
//   ?id=<itemId>          → captured (checkmark + parsed chips + text); auto-dismiss ~3s
//   ?error=empty|server   → first-class error state with copy + recovery link
//   (id present but item unresolvable) → treated as ?error=missing
//
// Auto-dismiss: ~3s after mount (happy path only), invalidate the inbox queries
// (so the sidebar count updates if the user lands in the shell), attempt
// window.close() (works only for script-opened windows), and on failure
// navigate to /app.
//
// NOTE: this page is registered with authRequired:false so it renders during
// session resolution. The happy path requires an authed user (the POST already
// authed them); if the item can't be loaded we show the missing state rather
// than bouncing to /login.

const DISMISS_MS = 3000;
const CLOSE_GRACE_MS = 100;

const ERROR_COPY: Record<string, string> = {
  empty: "Nothing to capture.",
  server: "Capture failed — try again.",
  missing: "Couldn't find that capture.",
};

export function SharePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const id = params.get("id");
  const error = params.get("error"); // empty | server | missing | null

  const itemQuery = useQuery(
    getInboxItem,
    { id: id ?? "" },
    { enabled: !!id },
  );

  // Happy-path auto-dismiss. Runs only once we have the item in hand.
  useEffect(() => {
    if (!id) return;
    if (itemQuery.isLoading || itemQuery.error || !itemQuery.data) return;

    const timer = setTimeout(() => {
      // Invalidate so the shell's inbox count reflects the new item.
      void queryClient.invalidateQueries({ queryKey: ["getInboxItems"] });
      void queryClient.invalidateQueries({ queryKey: ["getAppData"] });

      // Try to close (Android share activity / script-opened windows).
      window.close();

      // If still open after a grace period, land on /app.
      setTimeout(() => {
        if (!window.closed) navigate("/app", { replace: true });
      }, CLOSE_GRACE_MS);
    }, DISMISS_MS);

    return () => clearTimeout(timer);
  }, [
    id,
    itemQuery.isLoading,
    itemQuery.error,
    itemQuery.data,
    navigate,
    queryClient,
  ]);

  // Loading state (id present, query in flight).
  if (id && itemQuery.isLoading) {
    return renderShell("Capturing…");
  }

  // Happy path — render the captured item.
  if (id && itemQuery.data) {
    const item = itemQuery.data;
    // ParsedCaptureChips reads these fields; cleanText is unused for display.
    const parsed: ParsedCapture = {
      cleanText: item.text,
      parsedLens: item.parsedLens,
      parsedDate: item.parsedDate,
      parsedProject: item.parsedProject,
      parsedPriority: item.parsedPriority,
      parsedSize: item.parsedSize,
      parsedTags: item.parsedTags,
    };
    return (
      <main className="aa-share">
        <div className="aa-share__card">
          <span className="aa-share__check" aria-hidden="true">✓</span>
          <h1 className="aa-share__title">Captured</h1>
          <div className="aa-share__chips">
            <ParsedCaptureChips parsed={parsed} variant="captured" />
          </div>
          <p className="aa-share__text">{item.text}</p>
          <a className="aa-share__link" href="/app">View in inbox</a>
        </div>
      </main>
    );
  }

  // Error states. If id was present but the item didn't resolve (wrong user /
  // unknown / deleted), treat as missing. Otherwise read ?error=.
  const copy =
    id && !itemQuery.isLoading && !itemQuery.data
      ? ERROR_COPY.missing
      : ERROR_COPY[error ?? ""] ?? ERROR_COPY.missing;

  return (
    <main className="aa-share">
      <div className="aa-share__card">
        <h1 className="aa-share__title">{copy}</h1>
        <a className="aa-share__link" href="/app">Back to ActionAmp</a>
      </div>
    </main>
  );
}

function renderShell(label: string) {
  return (
    <main className="aa-share">
      <div className="aa-share__card">
        <h1 className="aa-share__title">{label}</h1>
      </div>
    </main>
  );
}

import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useQuery } from "wasp/client/operations";
import { useQueryClient } from "@tanstack/react-query";
import type { ParsedCapture } from "../inbox/parseCapture";
import { ParsedCaptureChips } from "../components/ui/CapturePopover";
import { getInboxItem } from "wasp/client/operations";
import { composeShareText, type ShareFields } from "./composeShareText";
import { clearPendingShare, getPendingShare } from "./pendingShare";
import "./SharePage.css";

const API_URL = (import.meta.env.REACT_APP_API_URL ?? "").replace(/\/$/, "");

const ERROR_COPY: Record<string, string> = {
  empty: "Nothing to capture.",
  server: "Capture failed — try again.",
  missing: "Couldn't find that capture.",
};

type PendingState = { id: string; fields: ShareFields } | null;

export function SharePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pendingId = params.get("pending");
  const id = params.get("id");
  const error = params.get("error");
  const [pending, setPending] = useState<PendingState>(null);
  const [loadingPending, setLoadingPending] = useState(!!pendingId);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!pendingId) return;
    let mounted = true;
    void getPendingShare(pendingId)
      .then((stored) => {
        if (mounted) setPending(stored ? { id: stored.id, fields: stored.fields } : null);
      })
      .catch(() => {
        if (mounted) setPending(null);
      })
      .finally(() => {
        if (mounted) setLoadingPending(false);
      });
    return () => { mounted = false; };
  }, [pendingId]);

  const itemQuery = useQuery(getInboxItem, { id: id ?? "" }, { enabled: !!id });

  async function confirmPending() {
    if (!pending) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const body = new URLSearchParams();
      for (const [field, value] of Object.entries(pending.fields)) {
        if (typeof value === "string") body.set(field, value);
      }
      const response = await fetch(`${API_URL}/api/share?response=json`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body,
        credentials: "include",
      });
      const result = await response.json().catch(() => ({})) as { redirect?: string };
      if (!response.ok || typeof result.redirect !== "string" || !result.redirect.startsWith("/")) {
        throw new Error("Could not add this to your inbox.");
      }
      await clearPendingShare(pending.id);
      void queryClient.invalidateQueries({ queryKey: ["getInboxItems"] });
      void queryClient.invalidateQueries({ queryKey: ["getAppData"] });
      navigate(result.redirect, { replace: true });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not add this to your inbox.");
    } finally {
      setSubmitting(false);
    }
  }

  async function discardPending() {
    if (pending) await clearPendingShare(pending.id);
    navigate("/app", { replace: true });
  }

  if (loadingPending) return renderShell("Preparing capture…");

  if (pendingId && pending) {
    const text = composeShareText(pending.fields);
    if (!text) return renderError(ERROR_COPY.empty);
    return (
      <main className="aa-share">
        <div className="aa-share__card aa-share__card--review">
          <p className="aa-share__eyebrow">Inbox capture</p>
          <h1 className="aa-share__title">Add this to your inbox?</h1>
          <p className="aa-share__text aa-share__text--review">{text}</p>
          {submitError && <p className="aa-share__error" role="alert">{submitError}</p>}
          <div className="aa-share__actions">
            <button className="aa-share__button" type="button" onClick={() => void confirmPending()} disabled={submitting}>
              {submitting ? "Adding…" : "Add to inbox"}
            </button>
            <button className="aa-share__link aa-share__link--button" type="button" onClick={() => void discardPending()}>
              Not now
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (id && itemQuery.isLoading) return renderShell("Loading capture…");

  if (id && itemQuery.data) {
    const item = itemQuery.data;
    const parsed: ParsedCapture = {
      cleanText: item.text,
      parsedLens: item.parsedLens,
      parsedDate: item.parsedDate ? new Date(item.parsedDate) : null,
      parsedProject: item.parsedProject,
      parsedPriority: item.parsedPriority,
      parsedSize: item.parsedSize,
      parsedTags: item.parsedTags,
    };
    return (
      <main className="aa-share">
        <div className="aa-share__card">
          <span className="aa-share__check" aria-hidden="true">✓</span>
          <h1 className="aa-share__title">Added to inbox</h1>
          <div className="aa-share__chips"><ParsedCaptureChips parsed={parsed} variant="captured" /></div>
          <p className="aa-share__text">{item.text}</p>
          <a className="aa-share__link" href="/app">View inbox</a>
        </div>
      </main>
    );
  }

  const copy = id && !itemQuery.isLoading && !itemQuery.data
    ? ERROR_COPY.missing
    : ERROR_COPY[error ?? ""] ?? ERROR_COPY.missing;
  return renderError(copy);
}

function renderShell(label: string) {
  return <main className="aa-share"><div className="aa-share__card"><h1 className="aa-share__title">{label}</h1></div></main>;
}

function renderError(copy: string) {
  return <main className="aa-share"><div className="aa-share__card"><h1 className="aa-share__title">{copy}</h1><a className="aa-share__link" href="/app">Back to ActionAmp</a></div></main>;
}

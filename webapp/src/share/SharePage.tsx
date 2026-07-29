import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { createInboxItem } from "wasp/client/operations";
import { BrandMark } from "../components/ui/BrandMark";
import { ArrowRightIcon, InboxIcon } from "../components/ui/icons";
import { composeShareCapture, type ShareFields } from "./composeShareText";
import { clearPendingShare, getPendingShare, type PendingShareImage } from "./pendingShare";
import "./SharePage.css";

const ERROR_COPY: Record<string, string> = {
  empty: "Nothing to capture.",
  server: "Capture failed — try again.",
  missing: "Couldn't find that capture.",
};

type PendingState = { id: string; fields: ShareFields; files: PendingShareImage[] } | null;

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function SharePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pendingId = params.get("pending");
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
        if (mounted) setPending(stored ? { id: stored.id, fields: stored.fields, files: stored.files ?? [] } : null);
      })
      .catch(() => {
        if (mounted) setPending(null);
      })
      .finally(() => {
        if (mounted) setLoadingPending(false);
      });
    return () => { mounted = false; };
  }, [pendingId]);

  async function confirmPending() {
    if (!pending) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const capture = composeShareCapture(pending.fields);
      if (!capture.text && pending.files.length === 0) throw new Error("Nothing to capture.");
      const attachments = await Promise.all(pending.files.map(async (file) => ({
        filename: file.filename,
        mimeType: file.mimeType,
        dataBase64: await blobToBase64(file.blob),
      })));
      // Use the normal Wasp capture action, not the cross-origin share API.
      // Inbox reads through the same authenticated operation, so a confirmed
      // item cannot be written under a different stale cookie session.
      const created = await createInboxItem({
        text: capture.text || pending.files[0]?.filename || "Shared image",
        title: capture.title || undefined,
        content: capture.content || undefined,
        sourceUrl: capture.url || undefined,
        attachments: attachments.length ? attachments : undefined,
      });
      await clearPendingShare(pending.id);
      void queryClient.invalidateQueries({ queryKey: ["getInboxItems"] });
      void queryClient.invalidateQueries({ queryKey: ["getAppData"] });
      navigate(`/app/inbox?shared=${encodeURIComponent(created.id)}`, { replace: true });
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
    const capture = composeShareCapture(pending.fields);
    if (!capture.text && pending.files.length === 0) return renderError(ERROR_COPY.empty);
    return (
      <main className="aa-share">
        <div className="aa-share__card aa-share__card--review">
          <header className="aa-share__header">
            <span className="aa-share__brand"><BrandMark size="sm" /></span>
            <span className="aa-share__brand-name">ActionAmp</span>
            <span className="aa-share__destination"><InboxIcon /> Inbox</span>
          </header>

          <div className="aa-share__intro">
            <p className="aa-share__eyebrow">Shared from another app</p>
            <h1 className="aa-share__title">Keep this for later.</h1>
            <p className="aa-share__lede">Review it once, then it waits in your Inbox until you are ready.</p>
          </div>

          <section className="aa-share__preview" aria-label="Shared item preview">
            <div className="aa-share__preview-label">
              <span className="aa-share__preview-dot" aria-hidden="true" />
              Ready to capture
            </div>
            {capture.title && <h2 className="aa-share__capture-title">{capture.title}</h2>}
            {capture.content && <p className="aa-share__text aa-share__text--review">{capture.content}</p>}
            {capture.url && <SharedLink url={capture.url} />}
            {pending.files.map((file) => <ImagePreview key={`${file.filename}-${file.size}`} file={file} />)}
          </section>
          {submitError && <p className="aa-share__error" role="alert">{submitError}</p>}
          <div className="aa-share__actions">
            <button className="aa-share__button" type="button" onClick={() => void confirmPending()} disabled={submitting}>
              <InboxIcon />
              {submitting ? "Adding…" : "Add to Inbox"}
              {!submitting && <ArrowRightIcon />}
            </button>
            <button className="aa-share__link aa-share__link--button" type="button" onClick={() => void discardPending()}>
              Not now
            </button>
          </div>
          <p className="aa-share__reassurance">Nothing is organized or scheduled yet.</p>
        </div>
      </main>
    );
  }

  return renderError(ERROR_COPY[error ?? ""] ?? ERROR_COPY.missing);
}

function ImagePreview({ file }: { file: PendingShareImage }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file.blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file.blob]);
  return url ? <img className="aa-share__image" src={url} alt="Shared image preview" /> : null;
}

function SharedLink({ url }: { url: string }) {
  let label = url;
  try {
    const parsed = new URL(url);
    label = `${parsed.hostname.replace(/^www\./, "")}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  } catch {
    // Share payloads may contain a non-standard URL. Keep the original visible
    // rather than hiding a source the user chose to capture.
  }
  return (
    <div className="aa-share__source" title={url}>
      <span className="aa-share__source-icon" aria-hidden="true">↗</span>
      <span className="aa-share__source-label">Source</span>
      <span className="aa-share__source-url">{label}</span>
    </div>
  );
}

function renderShell(label: string) {
  return <main className="aa-share"><div className="aa-share__card"><h1 className="aa-share__title">{label}</h1></div></main>;
}

function renderError(copy: string) {
  return <main className="aa-share"><div className="aa-share__card"><h1 className="aa-share__title">{copy}</h1><a className="aa-share__link" href="/app">Back to ActionAmp</a></div></main>;
}

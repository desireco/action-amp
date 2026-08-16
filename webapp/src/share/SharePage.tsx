import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { createInboxItem, createListItem, getLenses, getProjectsForResolver, useQuery } from "wasp/client/operations";
import { BrandMark } from "../components/ui/BrandMark";
import { ArrowRightIcon, InboxIcon } from "../components/ui/icons";
import { composeShareCapture, composeShareText, type ShareFields } from "./composeShareText";
import { clearPendingShare, getPendingShare, type PendingShareImage } from "./pendingShare";
import { blobToBase64, fileToDataUrl } from "../shared/imageFiles";
import "./SharePage.css";

const ERROR_COPY: Record<string, string> = {
  empty: "Nothing to capture.",
  server: "Capture failed — try again.",
  missing: "Couldn't find that capture.",
};

type PendingState = { id: string; fields: ShareFields; files: PendingShareImage[] } | null;
type Destination = "" | `project:${string}` | `list:${string}`;

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
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [destination, setDestination] = useState<Destination>("");
  const { data: lenses } = useQuery(getLenses, {});
  const { data: projects } = useQuery(getProjectsForResolver, undefined);

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

  useEffect(() => {
    if (!pending) return;
    const capture = composeShareCapture(pending.fields);
    setTitle(capture.title);
    setDescription(capture.content);
  }, [pending?.id]);

  async function confirmPending() {
    if (!pending) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const capture = composeShareCapture(pending.fields);
      const text = composeShareText({ ...pending.fields, title });
      if (!text && pending.files.length === 0) throw new Error("Nothing to capture.");
      const attachments = await Promise.all(pending.files.map(async (file) => ({
        filename: file.filename,
        mimeType: file.mimeType,
        dataBase64: await blobToBase64(file.blob),
      })));
      const [destinationType, destinationId] = destination.split(":", 2);
      if (destinationType === "list" && destinationId) {
        await createListItem({
          lensId: destinationId,
          text: text || pending.files[0]?.filename || "Shared image",
          content: description.trim() || undefined,
          sourceUrl: capture.url || undefined,
          attachments: attachments.length ? attachments : undefined,
        });
        await clearPendingShare(pending.id);
        localStorage.setItem("aa-lens-id", destinationId);
        void queryClient.invalidateQueries({ queryKey: ["getSimpleList"] });
        void queryClient.invalidateQueries({ queryKey: ["getAppData"] });
        navigate("/do/list", { replace: true });
        return;
      }
      // Use the normal Wasp capture action, not the cross-origin share API.
      // Inbox reads through the same authenticated operation, so a confirmed
      // item cannot be written under a different stale cookie session.
      const created = await createInboxItem({
        text: text || pending.files[0]?.filename || "Shared image",
        title: title.trim() || undefined,
        content: description.trim() || undefined,
        sourceUrl: capture.url || undefined,
        projectId: destinationType === "project" ? destinationId : undefined,
        lensId: destinationType === "list" ? destinationId : undefined,
        attachments: attachments.length ? attachments : undefined,
      });
      await clearPendingShare(pending.id);
      void queryClient.invalidateQueries({ queryKey: ["getInboxItems"] });
      void queryClient.invalidateQueries({ queryKey: ["getAppData"] });
      // `?item=` is InboxPage's scroll/highlight contract — `?shared=` was
      // never read there, so the just-captured item never got highlighted.
      navigate(`/do/inbox?item=${encodeURIComponent(created.id)}`, { replace: true });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not add this to your inbox.");
    } finally {
      setSubmitting(false);
    }
  }

  async function discardPending() {
    if (pending) await clearPendingShare(pending.id);
    navigate("/do", { replace: true });
  }

  if (loadingPending) return renderShell("Preparing capture…");

  if (pendingId && pending) {
    const capture = composeShareCapture(pending.fields);
    if (!capture.text && pending.files.length === 0) return renderError(ERROR_COPY.empty);
    const selectedList = destination.startsWith("list:")
      ? (lenses ?? []).find((lens) => lens.id === destination.slice("list:".length))
      : null;
    return (
      <main className="aa-share">
        <div className="aa-share__card aa-share__card--review">
          <header className="aa-share__header">
            <span className="aa-share__brand"><BrandMark size="sm" /></span>
            <span className="aa-share__brand-name">ActionAmp</span>
            <span className="aa-share__destination"><InboxIcon /> {selectedList?.name ?? "Inbox"}</span>
          </header>

          <div className="aa-share__intro">
            <h1 className="aa-share__title aa-share__title--intro">Keep this for later.</h1>
          </div>

          <section className="aa-share__preview" aria-label="Shared item preview">
            <div className="aa-share__preview-label">
              <span className="aa-share__preview-dot" aria-hidden="true" />
              Ready to capture
            </div>
            {capture.url && <SharedLink url={capture.url} />}
            {pending.files.map((file) => <ImagePreview key={`${file.filename}-${file.size}`} file={file} />)}
          </section>
          <section className="aa-share__details" aria-label="Optional capture details">
            <input
              className="aa-share__title-input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Title"
              aria-label="Title (optional)"
            />
            <textarea
              className="aa-share__description-input"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Add a note — why you saved this, or what to do with it"
              aria-label="Description (optional)"
              rows={3}
            />
            <label className="aa-share__field">
              <span>Where should this go? <em>optional</em></span>
              <select value={destination} onChange={(event) => setDestination(event.target.value as Destination)}>
                <option value="">Inbox — decide later</option>
                {(projects?.length ?? 0) > 0 && (
                  <optgroup label="Projects">
                    {projects?.map((project) => (
                      <option key={project.id} value={`project:${project.id}`}>
                        {project.name}{project.lensName ? ` · ${project.lensName}` : ""}
                      </option>
                    ))}
                  </optgroup>
                )}
                {(lenses ?? []).some((lens) => lens.type === "SIMPLE_LIST") && (
                  <optgroup label="Simple lists">
                    {(lenses ?? []).filter((lens) => lens.type === "SIMPLE_LIST").map((lens) => (
                      <option key={lens.id} value={`list:${lens.id}`}>{lens.name}</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </label>
          </section>
          {submitError && <p className="aa-share__error" role="alert">{submitError}</p>}
          <div className="aa-share__actions">
            <button className="aa-share__button" type="button" onClick={() => void confirmPending()} disabled={submitting}>
              <InboxIcon />
              {submitting ? "Adding…" : selectedList ? "Add to list" : "Add to Inbox"}
              {!submitting && <ArrowRightIcon />}
            </button>
            <button className="aa-share__link aa-share__link--button" type="button" onClick={() => void discardPending()}>
              Not now
            </button>
          </div>
          <p className="aa-share__reassurance">
            {destination.startsWith("list:")
              ? "It will be added directly to this list."
              : destination
                ? "It still goes through triage before anything is filed."
                : "Nothing is organized or scheduled yet."}
          </p>
        </div>
      </main>
    );
  }

  return renderError(ERROR_COPY[error ?? ""] ?? ERROR_COPY.missing);
}

function ImagePreview({ file }: { file: PendingShareImage }) {
  // data: URL, not an object URL — the deploy host's CSP allows data: image
  // sources but not blob:, so object URLs render broken in production.
  const [url, setUrl] = useState("");
  useEffect(() => {
    let cancelled = false;
    fileToDataUrl(file.blob)
      .then((dataUrl) => {
        if (!cancelled) setUrl(dataUrl);
      })
      .catch(() => {
        // A unreadable blob shows the fallback (no preview) — same as before.
      });
    return () => {
      cancelled = true;
    };
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
  return <main className="aa-share"><div className="aa-share__card"><h1 className="aa-share__title">{copy}</h1><a className="aa-share__link" href="/do">Back to ActionAmp</a></div></main>;
}

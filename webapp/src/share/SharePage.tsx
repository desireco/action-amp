import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { createInboxItem, createListItem, createResource, getProjectsForResolver, useQuery } from "wasp/client/operations";
import { BrandMark } from "../components/ui/BrandMark";
import { ArrowRightIcon, InboxIcon, ProjectsIcon } from "../components/ui/icons";
import { composeShareCapture, composeShareText, type ShareFields } from "./composeShareText";
import { clearPendingShare, getPendingShare, type PendingShareImage } from "./pendingShare";
import { blobToBase64, fileToDataUrl } from "../shared/imageFiles";
import "./SharePage.css";

const MISSING_ERROR_COPY = "Couldn't find that capture.";
const ERROR_COPY = new Map<string, string>([
  ["empty", "Nothing to capture."],
  ["server", "Capture failed — try again."],
  ["missing", MISSING_ERROR_COPY],
]);

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
        const listProject = (projects ?? []).find(
          (project) => project.id === destinationId && project.type === "SIMPLE_LIST",
        );
        if (!listProject) throw new Error("Couldn't find that list.");
        await createListItem({
          projectId: listProject.id,
          text: text || pending.files[0]?.filename || "Shared image",
          content: description.trim() || undefined,
          sourceUrl: capture.url || undefined,
          attachments: attachments.length ? attachments : undefined,
        });
        await clearPendingShare(pending.id);
        void queryClient.invalidateQueries({ queryKey: ["getSimpleList"] });
        void queryClient.invalidateQueries({ queryKey: ["getAppData"] });
        void queryClient.invalidateQueries({ queryKey: ["getProjects"] });
        navigate(`/do/projects/${listProject.permalink}`, { replace: true });
        return;
      }
      // A shared item assigned to a project is reference material, not a
      // decision waiting to happen: it files straight in as a Resource — no
      // triage, same as the list branch above. The Inbox is the only
      // destination that goes through triage.
      if (destinationType === "project" && destinationId) {
        const targetProject = (projects ?? []).find(
          (project) => project.id === destinationId && project.type !== "SIMPLE_LIST",
        );
        if (!targetProject) throw new Error("Couldn't find that project.");
        // Resource URLs must be http(s); a rare non-http share source (some
        // Android apps share content:// or intent:// URIs) folds into the
        // notes rather than failing the save.
        const httpUrl = /^https?:\/\//i.test(capture.url) ? capture.url : undefined;
        const notes = [
          description.trim(),
          httpUrl ? undefined : capture.url || undefined,
        ].filter(Boolean).join("\n\n") || undefined;
        await createResource({
          projectId: targetProject.id,
          title: title.trim() || text || pending.files[0]?.filename || "Shared item",
          url: httpUrl,
          notes,
          attachments: attachments.length ? attachments : undefined,
        });
        await clearPendingShare(pending.id);
        void queryClient.invalidateQueries({ queryKey: ["getProject"] });
        void queryClient.invalidateQueries({ queryKey: ["getAppData"] });
        void queryClient.invalidateQueries({ queryKey: ["getProjects"] });
        navigate(`/do/projects/${targetProject.permalink}`, { replace: true });
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
        attachments: attachments.length ? attachments : undefined,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
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
    if (!capture.text && pending.files.length === 0) {
      return renderError(ERROR_COPY.get("empty") ?? MISSING_ERROR_COPY);
    }
    const listProjects = (projects ?? []).filter(
      (project) => project.type === "SIMPLE_LIST",
    );
    const standardProjects = (projects ?? []).filter(
      (project) => project.type !== "SIMPLE_LIST",
    );
    const selectedList = destination.startsWith("list:")
      ? listProjects.find((project) => project.id === destination.slice("list:".length))
      : null;
    const selectedProject = destination.startsWith("project:")
      ? standardProjects.find((project) => project.id === destination.slice("project:".length))
      : null;
    const assignedDestination = selectedList ?? selectedProject;
    const DestinationIcon = assignedDestination ? ProjectsIcon : InboxIcon;
    return (
      <main className="aa-share">
        <div className="aa-share__card aa-share__card--review">
          <header className="aa-share__header">
            <span className="aa-share__brand"><BrandMark size="sm" /></span>
            <span className="aa-share__brand-name">ActionAmp</span>
            <span className="aa-share__destination"><DestinationIcon /> {assignedDestination?.name ?? "Inbox"}</span>
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
              <select value={destination} onChange={(event) => setDestination(/* SAFETY: <select> value is always a valid Destination. */ event.target.value as Destination)}>
                <option value="">Inbox — decide later</option>
                {standardProjects.length > 0 && (
                  <optgroup label="Projects">
                    {standardProjects.map((project) => (
                      <option key={project.id} value={`project:${project.id}`}>
                        {project.name}{project.lensName ? ` · ${project.lensName}` : ""}
                      </option>
                    ))}
                  </optgroup>
                )}
                {listProjects.length > 0 && (
                  <optgroup label="Simple lists">
                    {listProjects.map((project) => (
                      <option key={project.id} value={`list:${project.id}`}>
                        {project.name}{project.lensName ? ` · ${project.lensName}` : ""}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </label>
          </section>
          {submitError && <p className="aa-share__error" role="alert">{submitError}</p>}
          <div className="aa-share__actions">
            <button className="aa-share__button" type="button" onClick={() => void confirmPending()} disabled={submitting}>
              <DestinationIcon />
              {submitting ? "Adding…" : selectedList ? "Add to list" : selectedProject ? "Add to project" : "Add to Inbox"}
              {!submitting && <ArrowRightIcon />}
            </button>
            <button className="aa-share__link aa-share__link--button" type="button" onClick={() => void discardPending()}>
              Not now
            </button>
          </div>
          <p className="aa-share__reassurance">
            {assignedDestination
              ? `It will be added directly to this ${selectedList ? "list" : "project"}.`
              : "Nothing is organized or scheduled yet."}
          </p>
        </div>
      </main>
    );
  }

  return renderError(ERROR_COPY.get(error ?? "") ?? MISSING_ERROR_COPY);
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

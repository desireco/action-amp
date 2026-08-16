import "./AttachmentThumbs.css";

// The API origin for `<img>` srcs, read the same way Wasp's own client does
// (see PatSettingsPage). Empty in unknown envs → relative URLs, which work
// whenever the client is served from the API origin.
const API_URL = (import.meta.env.REACT_APP_API_URL ?? "").replace(/\/$/, "");

export function attachmentSrc(id: string): string {
  return `${API_URL}/api/attachments/${id}`;
}

export interface AttachmentThumb {
  id: string;
  filename: string;
}

/**
 * AttachmentThumbs — a calm row of captured-image thumbnails.
 *
 * The thumbnail is a link to the full-size image (served by
 * /api/attachments/:id, owner-gated via the session cookie). Rendering the
 * thumbs inline makes the "Image attached" chip redundant, so wherever this
 * appears the chip goes away — the image is the indicator.
 */
export function AttachmentThumbs({
  attachments,
  size = "sm",
}: {
  attachments: AttachmentThumb[];
  size?: "sm" | "md";
}) {
  if (attachments.length === 0) return null;
  return (
    <div className={`aa-attach-thumbs aa-attach-thumbs--${size}`}>
      {attachments.map((attachment) => (
        <a
          key={attachment.id}
          className="aa-attach-thumbs__link"
          href={attachmentSrc(attachment.id)}
          target="_blank"
          rel="noreferrer"
          title={attachment.filename}
          aria-label={`Open image ${attachment.filename}`}
        >
          <img
            className="aa-attach-thumbs__img"
            src={attachmentSrc(attachment.id)}
            alt={attachment.filename}
            loading="lazy"
          />
        </a>
      ))}
    </div>
  );
}

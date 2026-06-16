import { renderMarkdown } from "../shared/markdown";
import { PublicLayout } from "./PublicLayout";
import "./PublicLayout.css";

/**
 * Renders a markdown string inside the public layout.
 * The .aa-markdown-body class (PublicLayout.css) handles typography,
 * measure (line length), spacing, and readability.
 */
export function MarkdownPage({ children }: { children: string }) {
  const html = renderMarkdown(children);
  return (
    <PublicLayout>
      <div
        className="aa-markdown-body"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </PublicLayout>
  );
}

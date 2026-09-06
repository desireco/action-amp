import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./Markdown.css";

/**
 * Markdown — safe, shared renderer for user-authored markdown.
 *
 * Wraps `react-markdown` + `remark-gfm`. Renders to React elements (no
 * `dangerouslySetInnerHTML`), which is safe by construction for user content
 * — the reason it replaces the raw-text read path that Context/Outcome used
 * to take (task-fields spec §D). GFM adds tables, strikethrough, and
 * task-list checkboxes.
 *
 * Links open in a new tab with `rel="noopener"` — Context often references
 * external docs, and Outcome may link to what shipped. Coloring stays neutral:
 * teal is reserved for system/state (links get a subtle underline + the
 * accent on hover), amber is never used decoratively.
 *
 * Empty input renders nothing — callers gate the surrounding section on the
 * field being present, per the "empty stays empty" decision.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="aa-md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: (props) => (
            <a {...props} target="_blank" rel="noopener noreferrer" />
          ),
          // GFM task-list checkboxes render read-only — this surface displays
          // authored markdown, not an editor. A clickable checkbox that
          // toggles visually but persists nothing would be a calm violation
          // (an affordance that lies).
          input: (props) => <input {...props} disabled />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

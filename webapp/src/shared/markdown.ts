/**
 * Minimal markdown → HTML renderer.
 * Handles: headings (h1-h3), paragraphs, bold, italic, links,
 * unordered lists, ordered lists, blockquotes, horizontal rules, code.
 * No dependencies. Sufficient for our public pages (privacy, terms, about).
 *
 * For anything more complex, switch to react-markdown + remark-gfm.
 * But for now: zero deps, ~80 lines, handles everything we need.
 */

export function renderMarkdown(md: string): string {
  // Normalize line endings
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let inList: "ul" | "ol" | null = null;
  let inQuote = false;

  const closeList = () => {
    if (inList) {
      html.push(`</${inList}>`);
      inList = null;
    }
  };
  const closeQuote = () => {
    if (inQuote) {
      html.push("</blockquote>");
      inQuote = false;
    }
  };

  // Inline formatting: bold, italic, links, code
  const inline = (text: string): string => {
    return (
      text
        // inline code
        .replace(/`([^`]+)`/g, "<code>$1</code>")
        // bold
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/__([^_]+)__/g, "<strong>$1</strong>")
        // italic (not inside URLs)
        .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>")
        // links [text](url)
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    );
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines (they separate blocks, handled implicitly)
    if (trimmed === "") {
      closeList();
      closeQuote();
      continue;
    }

    // Headings
    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      closeList();
      closeQuote();
      const level = headingMatch[1].length;
      html.push(`<h${level}>${inline(headingMatch[2])}</h${level}>`);
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(trimmed)) {
      closeList();
      closeQuote();
      html.push("<hr />");
      continue;
    }

    // Blockquote
    if (trimmed.startsWith("> ")) {
      closeList();
      if (!inQuote) {
        html.push("<blockquote>");
        inQuote = true;
      }
      html.push(`<p>${inline(trimmed.slice(2))}</p>`);
      continue;
    }

    // Unordered list
    if (/^[-*]\s+/.test(trimmed)) {
      closeQuote();
      if (inList !== "ul") {
        closeList();
        html.push("<ul>");
        inList = "ul";
      }
      html.push(`<li>${inline(trimmed.replace(/^[-*]\s+/, ""))}</li>`);
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(trimmed)) {
      closeQuote();
      if (inList !== "ol") {
        closeList();
        html.push("<ol>");
        inList = "ol";
      }
      html.push(`<li>${inline(trimmed.replace(/^\d+\.\s+/, ""))}</li>`);
      continue;
    }

    // Paragraph
    closeList();
    closeQuote();
    html.push(`<p>${inline(trimmed)}</p>`);
  }

  closeList();
  closeQuote();
  return html.join("\n");
}

<script lang="ts">
  /**
   * Markdown — safe renderer for user-authored markdown (webapp ui/Markdown
   * port). The webapp renders via react-markdown + remark-gfm; the new stack
   * carries no markdown dependency, so this is the stand-in: input is HTML-
   * escaped FIRST, then a conservative subset is re-rendered (paragraphs,
   * `-`/`1.` lists, **bold**, *italic*, ~~strike~~, `code`, [links](url)).
   * Escaped-then-rewritten means no raw HTML can pass through — safe by
   * construction, the same property react-markdown gave the webapp. Links open
   * in a new tab, hardened (Context/Outcome often reference external docs).
   * Styling lives with the surfaces that host it (`.aa-md`).
   */
  let { text }: { text: string } = $props();

  function escapeHtml(s: string): string {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderInline(s: string): string {
    return s
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/~~([^~]+)~~/g, "<del>$1</del>")
      .replace(
        /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
      );
  }

  const html = $derived.by(() => {
    const lines = escapeHtml(text).replace(/\r\n/g, "\n").split("\n");
    const blocks: string[] = [];
    let paragraph: string[] = [];
    let list: { ordered: boolean; items: string[] } | null = null;

    const flushParagraph = () => {
      if (paragraph.length > 0) {
        blocks.push(`<p>${paragraph.map(renderInline).join("<br>")}</p>`);
        paragraph = [];
      }
    };
    const flushList = () => {
      if (list) {
        const tag = list.ordered ? "ol" : "ul";
        blocks.push(
          `<${tag}>${list.items.map((item) => `<li>${renderInline(item)}</li>`).join("")}</${tag}>`,
        );
        list = null;
      }
    };

    for (const line of lines) {
      const trimmed = line.trim();
      const unordered = trimmed.match(/^[-*]\s+(.*)$/);
      const ordered = trimmed.match(/^\d+[.)]\s+(.*)$/);
      if (unordered) {
        flushParagraph();
        if (!list || list.ordered) {
          flushList();
          list = { ordered: false, items: [] };
        }
        list.items.push(unordered[1]!);
      } else if (ordered) {
        flushParagraph();
        if (!list || !list.ordered) {
          flushList();
          list = { ordered: true, items: [] };
        }
        list.items.push(ordered[1]!);
      } else if (trimmed === "") {
        flushParagraph();
        flushList();
      } else {
        flushList();
        paragraph.push(line);
      }
    }
    flushParagraph();
    flushList();
    return blocks.join("");
  });
</script>

<!-- eslint-disable-next-line svelte/no-at-html-tags -- input is HTML-escaped before any rewrite; no raw markup survives -->
<div class="aa-md">{@html html}</div>

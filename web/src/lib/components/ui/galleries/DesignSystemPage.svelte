<script lang="ts">
  /**
   * DESIGN-SYSTEM reference page — the decided system from
   * docs/DESIGN-SYSTEM.md: the two-accent rule, the type scale, and the
   * neutral/spacing tokens. tokens.css is the source of truth.
   */
  const accents = [
    {
      name: "Teal",
      job: "system / state — completion, selection, primary CTA, links. Carries ~30% of any surface; the hero accent.",
      soft: "var(--aa-teal-soft)",
      strong: "var(--aa-teal)",
      text: "var(--aa-teal-cta)",
    },
    {
      name: "Amber",
      job: "rare human emphasis — Important priority, the “why this matters” nudge. Emphasis, never alarm.",
      soft: "var(--aa-amber-soft)",
      strong: "var(--aa-amber)",
      text: "var(--aa-amber-text)",
    },
    {
      name: "Violet",
      job: "projects / goals — the multi-step / outcome nouns.",
      soft: "var(--aa-violet-soft)",
      strong: "var(--aa-violet)",
      text: "var(--aa-violet-text)",
    },
    {
      name: "Rose",
      job: "errors / overdue only. Rare.",
      soft: "var(--aa-rose-soft)",
      strong: "var(--aa-rose)",
      text: "var(--aa-rose-text)",
    },
  ];

  const typeScale = [
    { token: "--aa-text-xs", size: "0.7rem", use: "kbd, micro-labels, eyebrow overlines" },
    { token: "--aa-text-sm", size: "0.78rem", use: "chips, meta, secondary text (most common)" },
    { token: "--aa-text-base", size: "0.9rem", use: "body, list rows" },
    { token: "--aa-text-md", size: "1rem", use: "primary body, button labels" },
    { token: "--aa-text-lg", size: "1.1rem", use: "card titles, hero subtitles" },
    { token: "--aa-text-xl", size: "1.5rem", use: "page titles" },
    { token: "--aa-text-2xl", size: "2rem", use: "hero, detail-page title" },
  ];

  const neutrals = [
    { token: "--aa-bg", label: "bg" },
    { token: "--aa-bg-soft", label: "bg-soft" },
    { token: "--aa-surface", label: "surface" },
    { token: "--aa-surface-muted", label: "surface-muted" },
    { token: "--aa-surface-muted-2", label: "surface-muted-2" },
    { token: "--aa-border", label: "border" },
    { token: "--aa-border-strong", label: "border-strong" },
    { token: "--aa-text", label: "text" },
    { token: "--aa-text-2", label: "text-2" },
    { token: "--aa-text-3", label: "text-3" },
    { token: "--aa-text-4", label: "text-4" },
  ];

  const radii = ["--aa-radius-xs", "--aa-radius-sm", "--aa-radius-md", "--aa-radius-lg", "--aa-radius-xl"];
</script>

<div class="page">
  <section class="block">
    <h2>The two-accent rule</h2>
    <p class="prose">
      Color carries meaning, never decoration. Teal = system/state; amber =
      rare human emphasis. Violet marks projects/goals, rose errors/overdue.
      Everything else is a cool-tinted neutral ramp (hue 230 in OKLCH); pure
      #000/#fff are banned. No streaks, badges, or guilt-trip color anywhere.
    </p>
    <div class="accents">
      {#each accents as a (a.name)}
        <div class="accent">
          <div class="swatch-row">
            <span class="swatch" style:background={a.soft} style:border-color={a.strong}></span>
            <span class="swatch" style:background={a.strong}></span>
            <span class="swatch" style:background={a.text}></span>
          </div>
          <h3>{a.name}</h3>
          <p class="prose">{a.job}</p>
        </div>
      {/each}
    </div>
  </section>

  <section class="block">
    <h2>Type scale (native system font only — no web fonts)</h2>
    {#each typeScale as t (t.token)}
      <div class="type-row">
        <span class="sample" style:font-size={t.size}>The next thing that matters</span>
        <code>{t.token} · {t.size}</code>
        <span class="use">{t.use}</span>
      </div>
    {/each}
  </section>

  <section class="block">
    <h2>Neutral ramp (cool-tinted, OKLCH)</h2>
    <div class="neutrals">
      {#each neutrals as n (n.token)}
        <figure class="neutral" title={n.token}>
          <span class="chip" style:background={`var(${n.token})`}></span>
          <figcaption>{n.label}</figcaption>
        </figure>
      {/each}
    </div>
  </section>

  <section class="block">
    <h2>Radii (4/8 grid)</h2>
    <div class="radii">
      {#each radii as r (r)}
        <span class="radius" style:border-radius={`var(${r})`}><code>{r.replace("--aa-radius-", "")}</code></span>
      {/each}
    </div>
  </section>
</div>

<style>
  .page {
    padding: var(--aa-space-xl);
    max-width: 720px;
    display: flex;
    flex-direction: column;
    gap: var(--aa-space-2xl);
    background: var(--aa-bg);
    color: var(--aa-text);
    font-family: var(--aa-font);
  }
  h2 {
    font-size: var(--aa-text-lg);
    font-weight: var(--aa-weight-semibold);
    letter-spacing: -0.02em;
    margin: 0 0 var(--aa-space-md);
  }
  h3 {
    font-size: var(--aa-text-base);
    margin: var(--aa-space-sm) 0 0;
  }
  .prose {
    font-size: var(--aa-text-sm);
    color: var(--aa-text-3);
    line-height: var(--aa-leading-normal);
    margin: 0;
  }
  .block {
    display: flex;
    flex-direction: column;
    gap: var(--aa-space-sm);
  }
  .accents {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: var(--aa-space-md);
  }
  .swatch-row {
    display: flex;
    gap: 4px;
  }
  .swatch {
    width: 32px;
    height: 32px;
    border-radius: var(--aa-radius-sm);
    border: 1px solid var(--aa-border);
    display: inline-block;
  }
  .type-row {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 2px var(--aa-space-md);
    align-items: baseline;
    padding: var(--aa-space-xs) 0;
    border-bottom: 1px solid var(--aa-border);
  }
  .sample {
    grid-column: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .type-row code {
    font-family: var(--aa-font-mono);
    font-size: var(--aa-text-xs);
    color: var(--aa-text-4);
    justify-self: end;
  }
  .type-row .use {
    grid-column: 1 / -1;
    font-size: var(--aa-text-xs);
    color: var(--aa-text-4);
  }
  .neutrals {
    display: flex;
    flex-wrap: wrap;
    gap: var(--aa-space-sm);
  }
  .neutral {
    margin: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }
  .chip {
    width: 40px;
    height: 40px;
    border-radius: var(--aa-radius-sm);
    border: 1px solid var(--aa-border);
    display: block;
  }
  figcaption {
    font-family: var(--aa-font-mono);
    font-size: var(--aa-text-xs);
    color: var(--aa-text-4);
  }
  .radii {
    display: flex;
    gap: var(--aa-space-sm);
    flex-wrap: wrap;
  }
  .radius {
    width: 72px;
    height: 44px;
    border: 1.5px solid var(--aa-teal);
    background: var(--aa-teal-soft);
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
</style>

<script lang="ts">
  // Button gallery — every variant × size on one surface, plus kbd, icon
  // and disabled states. Rendered on the token background.
  import Button from "../Button.svelte";
  import { createRawSnippet } from "svelte";

  const label = (text: string) => createRawSnippet(() => ({ render: () => text }));
  const icon = createRawSnippet(() => ({
    render: () => `<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9.5 4.5L13 8l-3.5 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  }));

  const variants = ["primary", "secondary", "ghost", "danger"] as const;
  const sizes = ["sm", "md", "lg"] as const;
</script>

<div class="gallery">
  <table>
    <thead>
      <tr>
        <th></th>
        {#each sizes as s (s)}<th>{s}</th>{/each}
      </tr>
    </thead>
    <tbody>
      {#each variants as v (v)}
        <tr>
          <th>{v}</th>
          {#each sizes as s (s)}
            <td>
              <Button variant={v} size={s}>{label(`${v} · ${s}`)}</Button>
            </td>
          {/each}
        </tr>
      {/each}
      <tr>
        <th>icon</th>
        <td colspan={3}>
          <Button variant="primary" size="md" {icon}>{label("Start this")}</Button>
          <Button variant="secondary" size="md" iconEnd {icon}>{label("Next")}</Button>
        </td>
      </tr>
      <tr>
        <th>kbd</th>
        <td colspan={3}>
          <Button variant="secondary" size="md" kbd="⌘K">{label("Capture")}</Button>
        </td>
      </tr>
      <tr>
        <th>disabled</th>
        <td colspan={3}>
          <Button variant="primary" size="md" disabled>{label("Nothing due")}</Button>
        </td>
      </tr>
      <tr>
        <th>bare</th>
        <td colspan={3}>
          <Button bare>{label("Bare — embeds inside other components")}</Button>
        </td>
      </tr>
    </tbody>
  </table>
</div>

<style>
  .gallery {
    padding: var(--aa-space-lg);
    background: var(--aa-bg);
    border: 1px solid var(--aa-border);
    border-radius: var(--aa-radius-lg);
    font-family: var(--aa-font);
  }
  table {
    border-collapse: collapse;
  }
  th {
    text-align: left;
    font-size: var(--aa-text-xs);
    font-weight: var(--aa-weight-semibold);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--aa-text-4);
    padding: var(--aa-space-sm) var(--aa-space-md) var(--aa-space-sm) 0;
  }
  td {
    padding: var(--aa-space-sm) var(--aa-space-md) var(--aa-space-sm) 0;
  }
</style>

<!--
  PublicLayout — S15 port of webapp/src/shared/PublicLayout.tsx (same look;
  the CSS is the webapp PublicLayout.css verbatim, adjusted only where this
  stack's token names differ). The bare chrome the public app pages (the
  Founding 100 offer + post-checkout welcome) render inside.
-->
<script lang="ts">
  import "../../lib/styles/publicLayout.css";
  let { children } = $props();
</script>

<div class="aa-public">
  <nav class="aa-pub-nav">
    <a href="/" class="aa-brand">
      <span class="aa-brand-mark">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path
            d="M3.5 8.5l3 3 6-7"
            stroke="currentColor"
            stroke-width="2.4"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </span>
      <span class="aa-brand-name">ActionAmp</span>
    </a>
    <a href="/" class="aa-pub-back">← Home</a>
  </nav>

  <main class="aa-pub-main">
    {@render children()}
  </main>

  <footer class="aa-pub-footer">
    <div class="aa-pub-footer-inner">
      <a href="/" class="aa-brand">
        <span class="aa-brand-mark aa-brand-mark-sm">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
            <path
              d="M3.5 8.5l3 3 6-7"
              stroke="currentColor"
              stroke-width="2.4"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </span>
        <span class="aa-brand-name aa-brand-name-sm">ActionAmp</span>
      </a>
      <div class="aa-pub-footer-links">
        <a href="https://actionamp.com/about">About</a>
        <a href="https://actionamp.com/privacy">Privacy</a>
        <a href="https://actionamp.com/terms">Terms</a>
        <a href="https://actionamp.com/roadmap">Roadmap</a>
        <a href="/founding-100">Founding 100</a>
      </div>
      <div class="aa-pub-copy">
        © 2026 ActionAmp · Proudly
        <a href="https://dakic.com">Built By Dakic</a>
      </div>
    </div>
  </footer>
</div>

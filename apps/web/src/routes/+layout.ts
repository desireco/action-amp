// SPA: pure client-side. The web app talks to the Hono API same-origin via
// the vite dev proxy (see vite.config.ts), so there is nothing to
// server-render and nothing to prerender.
export const ssr = false;
export const prerender = false;

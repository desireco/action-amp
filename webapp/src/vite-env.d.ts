/// <reference types="vite/client" />
/// <reference types="vitest/globals" />
/// <reference types="@testing-library/jest-dom" />

// Build-time global injected by vite.config.ts (define block). Short git
// SHA at build time — surfaced in Settings → About, login footer, and as a
// support/debug signal. See vite.config.ts.
declare const __APP_VERSION__: string;

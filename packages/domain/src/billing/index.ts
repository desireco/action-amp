// F4b — public export barrel for the billing core. Same pattern as
// src/db/index.ts: star re-exports, one line per module. `EntitlementMessage`
// is declared in entitlement-types.ts and re-exported by entitlements.ts (same
// declaration, so the double star path is unambiguous). S16 adds the billing
// LIFECYCLE cores additively (webhook handlers + checkout/portal params).
export * from './config.js';
export * from './entitlements.js';
export * from './entitlement-types.js';
export * from './webhookCore.js';
export * from './checkoutCore.js';

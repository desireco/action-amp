import express from "express";
import type { MiddlewareConfigFn } from "wasp/server";

// Ensures the share POST route parses `application/x-www-form-urlencoded`
// bodies (the enctype declared in manifest.json's share_target). Wasp's
// default global stack includes express.urlencoded, but setting it explicitly
// on the route (a) makes the dependency obvious to readers, and (b) guarantees
// `{ extended: true }` regardless of the default's options.
//
// Modeled on webapp/src/billing/webhookMiddleware.ts.
export const shareRouteMiddleware: MiddlewareConfigFn = (middlewareConfig) => {
  middlewareConfig.set(
    "express.urlencoded",
    express.urlencoded({ extended: true }),
  );
  return middlewareConfig;
};

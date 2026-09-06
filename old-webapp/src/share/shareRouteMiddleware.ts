import express from "express";
import type { MiddlewareConfigFn } from "wasp/server";
import { attachSessionFromCookie, sessionAuthMiddleware } from "../auth/sessionAuth";

// The /api/share route's stack. Two concerns:
//
// 1. Parses `application/x-www-form-urlencoded` bodies (the enctype declared
//    in manifest.json's share_target). Wasp's default global stack includes
//    express.urlencoded, but setting it explicitly on the route (a) makes the
//    dependency obvious to readers, and (b) guarantees `{ extended: true }`
//    regardless of the default's options.
//
// 2. Session-cookie auth. The route is `auth: false` + sessionAuthMiddleware
//    (not `auth: true`): Wasp prepends its own auth handler BEFORE this stack
//    on /api/* routes, so it can never see the Authorization header the
//    cookie lift synthesizes in here. The share POST is a top-level form
//    navigation from the installed PWA — it carries the wasp_session cookie
//    (SameSite=lax permits top-level navigations) and no Bearer header, so
//    the in-stack lift + check is the only position that works.
//
// Modeled on webapp/src/billing/webhookMiddleware.ts.
export const shareRouteMiddleware: MiddlewareConfigFn = (middlewareConfig) => {
  middlewareConfig.set(
    "express.urlencoded",
    express.urlencoded({ extended: true }),
  );
  middlewareConfig.set("sessionCookieAuth", attachSessionFromCookie);
  middlewareConfig.set("sessionAuth", sessionAuthMiddleware);
  return middlewareConfig;
};

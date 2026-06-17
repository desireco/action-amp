/**
 * Middleware config for the Stripe webhook API.
 *
 * Swaps out express.json (the default) for express.raw so the raw body
 * is available for signature verification. This is the #1 Stripe integration
 * gotcha — see BILLING-INTEGRATION.md §8.
 */
import express from "express";
import type { MiddlewareConfigFn } from "wasp/server";

export const stripeWebhookMiddleware: MiddlewareConfigFn = (middlewareConfig) => {
  // Remove JSON parsing — it would consume the raw body.
  middlewareConfig.delete("express.json");
  // Replace with raw body capture (type: "*/*" catches Stripe's application/json)
  middlewareConfig.set("express.raw", express.raw({ type: "*/*" }));
  return middlewareConfig;
};

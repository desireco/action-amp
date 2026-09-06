import type { MiddlewareConfigFn } from "wasp/server";
import express from "express";

const ORIGINS = new Set(["https://actionamp.com", "https://app.actionamp.com"]);

export const analyticsMiddleware: MiddlewareConfigFn = (middlewareConfig) => {
  // The marketing site uses a simple text/plain POST so browsers do not need
  // an OPTIONS preflight on this anonymous, no-cookie endpoint. Parse that
  // body here while leaving the app's normal JSON parser untouched.
  middlewareConfig.set("express.text", express.text({ type: "text/plain" }));
  middlewareConfig.set("corsApex", (req, res, next) => {
    const origin = req.headers.origin;
    if (origin && ORIGINS.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    }
    if (req.method === "OPTIONS") return res.status(204).end();
    next();
  });
  return middlewareConfig;
};

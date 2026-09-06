import { defineConfig, type OxlintConfig } from "oxlint";

export default defineConfig({
  rules: {
    // Keep explicit guardrails beyond Oxlint's default correctness category.
    // These catch common review findings before a human has to rediscover them.
    "eqeqeq": "error",
    "no-constant-binary-expression": "error",
    "no-debugger": "error",
    "no-duplicate-imports": "error",
    "no-promise-executor-return": "error",
    "no-template-curly-in-string": "error",

    // Anti-slop is intentionally strict for new and changed code. Existing
    // diagnostics are cleanup work, not a reason to weaken these safeguards.
    "anti-slop/no-chained-type-assertions": "error",
    "anti-slop/no-conditional-empty-object-spread": "error",
    "anti-slop/no-known-value-widening": "error",
    "anti-slop/no-module-mocking": "error",
    "anti-slop/no-object-parameters": "error",
    "anti-slop/no-reflect-apply": "error",
    "anti-slop/no-reflect-get": "error",
    "anti-slop/no-runtime-typeof": "error",
    "anti-slop/no-shape-in-symbol-names": "error",
    "anti-slop/no-unknown-parameters": "error",
    "anti-slop/no-unknown-returns": "error",
    "anti-slop/no-unknown-type-aliases": "error",
    "anti-slop/no-unsafe-dictionary-type": "error",
    "anti-slop/no-widen-then-assert": "error",
    "anti-slop/require-safety-comment-for-type-assertion": "error",
  } satisfies OxlintConfig["rules"],

  ignorePatterns: [
    ".agent/**",
    ".agents/**",
    ".claude/**",
    ".codex/**",
    ".continue/**",
    ".cursor/**",
    ".gemini/**",
    ".opencode/**",
    ".pi/**",
    ".roo/**",
    ".windsurf/**",
    "tools/oxlint/anti-slop/**",
    // Wasp generated output
    ".wasp/**",
    "node_modules/**",
    // E2e fixtures
    "e2e/**",
  ],

  jsPlugins: [
    {
      name: "anti-slop",
      specifier: "./tools/oxlint/anti-slop/index.ts",
    },
  ],
});

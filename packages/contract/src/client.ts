/**
 * Typed client factory + mock transport for the contract.
 *
 * Two ways to get a client, both returning the same `RouterClient` type:
 *
 * - `createClient({ url })` — real transport: oRPC's `RPCLink` (JSON-RPC
 *   style POSTs against the API's `/rpc` endpoint, mounted in F8b). Same-origin
 *   fetch with the session cookie (`credentials: "include"`).
 * - `createMockClient(mockRouter)` — in-memory transport: a custom oRPC
 *   `ClientLink` that dispatches `path`/`input` directly into plain async
 *   functions. No network, no faked fetch URLs — the seam oRPC designed for
 *   exactly this (a link is just `{ call(path, input, options) }`).
 *
 * Swapping mock → real in an app is one line: replace `createMockClient(m)`
 * with `createClient({ url: "/rpc" })`. Everything downstream (stores,
 * screens) is unchanged.
 */

import {
  createORPCClient,
  ORPCError,
  type ClientLink,
  type InferClientInputs,
  type InferClientOutputs,
} from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { Router } from "./router-type.js";

/** The typed client — `client.tasks.list()` & co. Shape comes from `Router`. */
export type RouterClient = Router;

/** Input type at every procedure path — `{ tasks: { list: undefined } }`. */
export type RouterInputs = InferClientInputs<Router>;

/** Output type at every procedure path — `{ tasks: { list: Task[] } }`. */
export type RouterOutputs = InferClientOutputs<Router>;

type MaybePromise<T> = T | Promise<T>;

/**
 * In-memory implementation of the router: the same paths as `Router`, but
 * plain functions instead of client callables. Derived from `Router` via
 * `InferClientInputs`/`InferClientOutputs`, so it tracks the F8b swap
 * automatically. (Derivation assumes `namespace.procedure` depth — the
 * ActionAmp router shape — extend the mapped type if a deeper nesting ever
 * lands.)
 */
export type MockRouter = {
  // Key intersections: RouterInputs/RouterOutputs are deferred homomorphic
  // mappings over `Router`, so TS cannot prove their keysets match for a
  // generic K/P — intersecting the keys makes both index writes provable.
  [K in keyof RouterInputs & keyof RouterOutputs]: {
    [P in keyof RouterInputs[K] & keyof RouterOutputs[K]]: (
      input: RouterInputs[K][P],
    ) => MaybePromise<RouterOutputs[K][P]>;
  };
};

export interface CreateClientOptions {
  /** Base URL of the RPC endpoint — F8b mounts the router at `/rpc`. */
  url: string;
  /** Headers injected into every request (auth, client hints). */
  headers?: () => Record<string, string>;
}

/** Real transport: RPCLink POSTs against the API's `/rpc` mount. */
export function createClient(options: CreateClientOptions): RouterClient {
  // RPCLink resolves the url via `new URL(url)` with no base, so a relative
  // mount path like "/rpc" must be absolutized first. In the browser that is
  // same-origin (the SPA talks to the API through the vite dev proxy in dev,
  // and same-origin /rpc in prod). Outside a browser the caller must pass an
  // absolute url.
  const base = (
    globalThis as { location?: { origin: string } }
  ).location?.origin;
  const link = new RPCLink({
    url: new URL(options.url, base).toString(),
    headers: options.headers,
    fetch: (request, init) => fetch(request, { ...init, credentials: "include" }),
  });
  return createORPCClient<RouterClient>(link);
}

/**
 * Mock transport: serves responses from `router` in memory. Unknown paths
 * reject with oRPC `ORPCError`s ("NOT_FOUND" / "METHOD_NOT_SUPPORTED"), so
 * error handling paths in stores behave like the real thing.
 */
export function createMockClient(router: MockRouter): RouterClient {
  return createORPCClient<RouterClient>(new MockLink(router));
}

/**
 * The mock seam: a `ClientLink` whose `call` walks the procedure `path`
 * through the mock router object and invokes the function at the leaf.
 * Everything else (typing, `safe()` wrapping, client proxying) comes from
 * `createORPCClient` — identical to the real transport's pipeline.
 */
class MockLink implements ClientLink<Record<never, never>> {
  readonly #router: MockRouter;

  constructor(router: MockRouter) {
    this.#router = router;
  }

  async call(path: readonly string[], input: unknown): Promise<unknown> {
    const procedure = resolveProcedure(this.#router, path);
    return await procedure(input);
  }
}

function resolveProcedure(
  router: MockRouter,
  path: readonly string[],
): (input: unknown) => unknown {
  let node: unknown = router;
  for (const segment of path) {
    if (typeof node !== "object" || node === null || !(segment in node)) {
      throw new ORPCError("NOT_FOUND", {
        message: `mock router has no procedure at /${path.join("/")}`,
      });
    }
    node = (node as Record<string, unknown>)[segment];
  }
  if (typeof node !== "function") {
    throw new ORPCError("METHOD_NOT_SUPPORTED", {
      message: `mock path /${path.join("/")} is a namespace, not a procedure`,
    });
  }
  return node as (input: unknown) => unknown;
}

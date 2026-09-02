/**
 * Minimal Bun runtime globals.
 *
 * `bun-types` is not installed in this workspace (it only appears in bun.lock
 * as an unmet drizzle-orm peerDependency), so we declare the slice of `Bun`
 * this app uses. Remove this file if/when bun-types is added as a devDep.
 */
declare const Bun: {
  serve(options: {
    port?: number;
    hostname?: string;
    fetch: (request: Request) => Response | Promise<Response>;
    error?: (error: Error) => Response | Promise<Response> | void;
  }): {
    port: number;
    hostname: string;
    stop(closeActiveConnections?: boolean): void;
  };
};

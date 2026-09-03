# ActionAmp (new stack) — single-service image: the Hono API + the built
# SvelteKit SPA served by the same Bun process (one origin, one domain).
FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock ./
COPY api/package.json api/
COPY web/package.json web/
COPY packages/domain/package.json packages/domain/
COPY packages/contract/package.json packages/contract/
RUN bun install --frozen-lockfile
COPY . .
# The web build needs no api/.env; the API build is typecheck-free here.
RUN cd web && bunx vite build

FROM oven/bun:1 AS runtime
# Whole-workspace copy: the build stage's node_modules already hold the exact
# isolated-layout links every workspace resolves through. Larger image, zero
# resolution drift; trim in a later pass if the size matters.
WORKDIR /app
COPY --from=build /app ./
ENV NODE_ENV=production
ENV WEB_DIST_DIR=/app/web/build
EXPOSE 8080
WORKDIR /app/api
CMD ["bun", "src/index.ts"]

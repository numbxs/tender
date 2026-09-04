/**
 * Node-only bootstrap for local dev (`pnpm dev` / `pnpm start`). The
 * deployed app -- Cloudflare Workers -- never imports this file: Workers
 * uses `src/index.ts`'s default export directly. Keeping @hono/node-server
 * out of app.ts means the same Hono app runs on both without a bundler
 * choking on node-only APIs during the Workers build.
 */
import { serve } from "@hono/node-server";
import { app } from "./app.js";

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, () => {
  console.log(`tender-gateway listening on http://localhost:${port}`);
});

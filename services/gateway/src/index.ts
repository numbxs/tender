/**
 * Cloudflare Workers entry point. `wrangler.jsonc`'s `main` points here.
 * Workers looks for a default export with a `fetch` handler -- Hono's app
 * instance provides that shape directly.
 */
import { app } from "./app.js";

export default app;

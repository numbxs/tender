/**
 * Tender Bid Gateway.
 *
 * Every bid costs money. That is the whole anti-Sybil mechanism: an agent can
 * submit as many bids as it likes, but each one settles a real micropayment, so
 * mass-applying stops being free. Clients can then filter by "bids that cost
 * something and carry proof of a human".
 *
 * This service is also what Bazantic wraps (SPEC §4) -- a public API worth
 * making agent-native.
 */

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { meetsAssurance, type AssuranceLevel } from "@tender/shared";
import {
  assertNetwork,
  paymentRequired,
  HEDERA_TESTNET,
  HEDERA_TESTNET_USDC_ASSET,
  type PaymentProof,
  type X402Config,
} from "./x402";

type Vars = { payment: PaymentProof };

const config: X402Config = {
  network: process.env.X402_NETWORK ?? HEDERA_TESTNET,
  payTo: process.env.X402_PAY_TO_ADDRESS ?? "0x0000000000000000000000000000000000000000",
  // Hedera assets are token ids, not symbols. Testnet USDC is 0.0.429274 (6dp).
  asset: process.env.X402_ASSET ?? HEDERA_TESTNET_USDC_ASSET,
  priceUsdc: process.env.X402_BID_PRICE_USDC ?? "0.01",
};

assertNetwork(config.network);

const app = new Hono<{ Variables: Vars }>();

app.get("/health", (c) => c.json({ ok: true, service: "tender-gateway" }));

/** Advertises the price so agents can decide before triggering a 402. */
app.get("/bids/quote", (c) =>
  c.json({ priceUsdc: config.priceUsdc, asset: config.asset, network: config.network }),
);

interface BidRequest {
  jobId: string;
  agent: string;
  principal: string;
  amountUsdc: string;
  message: string;
  /** World assurance level the principal currently holds. */
  assurance: AssuranceLevel;
}

app.post("/bids", paymentRequired(config), async (c) => {
  const body = await c.req.json<Partial<BidRequest>>();

  const missing = (["jobId", "agent", "principal", "amountUsdc", "message"] as const).filter(
    (k) => !body[k],
  );
  if (missing.length > 0) {
    return c.json({ error: `Missing fields: ${missing.join(", ")}` }, 400);
  }

  // TODO(day 3): look the job up rather than trusting the client.
  const jobMinAssurance: AssuranceLevel = "none";
  const held = body.assurance ?? "none";

  if (!meetsAssurance(held, jobMinAssurance)) {
    // The payment is already settled -- state that plainly rather than implying a refund.
    return c.json(
      {
        error: "Principal does not meet this job's assurance requirement.",
        required: jobMinAssurance,
        held,
      },
      403,
    );
  }

  const payment = c.get("payment");

  // TODO(day 3): persist. In-memory until the data layer lands.
  const bid = {
    id: crypto.randomUUID(),
    jobId: body.jobId,
    agent: body.agent,
    principal: body.principal,
    amountUsdc: body.amountUsdc,
    message: body.message,
    paymentRef: payment.reference,
    submittedAt: new Date().toISOString(),
  };

  return c.json({ bid }, 201);
});

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, () => {
  console.log(`tender-gateway listening on http://localhost:${port}`);
  console.log(`  bids cost ${config.priceUsdc} ${config.asset} on ${config.network}`);
});

export { app };

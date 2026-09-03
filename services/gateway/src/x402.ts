/**
 * x402 payment gating.
 *
 * This is the service half of Hedera's AI & Agentic Payments track, which asks
 * you to host a live x402-gated service *and* build the platform consuming it.
 * `services/agent` is the consumer.
 *
 * The flow, per HTTP 402:
 *   1. Agent calls a gated route with no payment header.
 *   2. We answer 402 with the payment requirements.
 *   3. Agent pays and retries with an `X-PAYMENT` header.
 *   4. We verify and settle, then serve the route.
 *
 * TODO(day 7): swap `verifyPayment` for the official x402 facilitator client.
 * The challenge shape below follows the spec so the agent side does not change
 * when we do. Do not ship the stub -- a mocked payment fails the track.
 */

import type { Context, MiddlewareHandler } from "hono";

export interface PaymentRequirements {
  scheme: "exact";
  network: string;
  /** Price in USDC base units, as a decimal string. */
  maxAmountRequired: string;
  payTo: string;
  asset: string;
  resource: string;
  description: string;
}

export interface PaymentProof {
  /** Settlement reference we store on the Bid, so a bid can be traced to its payment. */
  reference: string;
  payer: string;
}

export interface X402Config {
  network: string;
  payTo: string;
  asset: string;
  priceUsdc: string;
}

export class PaymentRequiredError extends Error {
  constructor(readonly requirements: PaymentRequirements) {
    super("Payment required");
  }
}

/**
 * Verify an `X-PAYMENT` header.
 *
 * STUB. Returns null for anything that is not obviously well-formed so the 402
 * path is exercised end to end during development.
 */
async function verifyPayment(header: string, _config: X402Config): Promise<PaymentProof | null> {
  const trimmed = header.trim();
  if (!trimmed) return null;
  // TODO(day 7): call the facilitator to verify and settle. Until then, treat a
  // non-empty header as paid so the agent loop is testable offline.
  return { reference: trimmed.slice(0, 64), payer: "unknown" };
}

/** Gate a route behind x402. On success, `c.get("payment")` holds the proof. */
export function paymentRequired(config: X402Config): MiddlewareHandler {
  return async (c, next) => {
    const header = c.req.header("X-PAYMENT");

    if (!header) {
      return respond402(c, config);
    }

    const proof = await verifyPayment(header, config);
    if (!proof) {
      return respond402(c, config);
    }

    c.set("payment", proof);
    await next();
  };
}

function respond402(c: Context, config: X402Config) {
  const requirements: PaymentRequirements = {
    scheme: "exact",
    network: config.network,
    maxAmountRequired: config.priceUsdc,
    payTo: config.payTo,
    asset: config.asset,
    resource: new URL(c.req.url).pathname,
    description: "One bid submission on Tender",
  };
  return c.json({ x402Version: 1, accepts: [requirements] }, 402);
}

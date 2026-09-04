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
 * Network ids are CAIP-2. Hedera testnet is `hedera:testnet` -- NOT
 * `hedera-testnet`, which @x402/hedera rejects outright. `assertNetwork` below
 * turns that mistake into a boot failure rather than a 402 no facilitator will
 * ever honour.
 *
 * TODO(day 7): swap `verifyPayment` for a real FacilitatorClient and
 * `paymentMiddleware(routes, server)` from @x402/hono, with
 * `new x402ResourceServer(facilitator).register(HEDERA_TESTNET_CAIP2, new ExactHederaScheme())`.
 * The challenge shape below already matches, so the agent side will not change.
 * Do not ship the stub -- Hedera's track requires a LIVE gated service.
 */

import type { Context, MiddlewareHandler } from "hono";

/**
 * These four are copied from @x402/hedera's own exported constants rather
 * than imported from the package. Importing anything from its barrel pulls
 * in @hiero-ledger/sdk's full gRPC client (fs, tls, node:path) transitively --
 * fine in Node, fatal in a Workers bundle, and unnecessary here since this
 * service never opens a Hedera gRPC connection, only reasons about ids.
 * Re-verify against @x402/hedera on any version bump.
 */
const HEDERA_TESTNET_CAIP2 = "hedera:testnet";
const HEDERA_TESTNET_USDC = "0.0.429274";
const HEDERA_USDC_DECIMALS = 6;
const SUPPORTED_HEDERA_NETWORKS = ["hedera:mainnet", "hedera:testnet"];
function isSupportedHederaNetwork(network: string): boolean {
  return SUPPORTED_HEDERA_NETWORKS.includes(network);
}

export const HEDERA_TESTNET = HEDERA_TESTNET_CAIP2;
export const HEDERA_TESTNET_USDC_ASSET = HEDERA_TESTNET_USDC;
export const USDC_DECIMALS = HEDERA_USDC_DECIMALS;

/** Fail at boot on an unusable network id, instead of serving a dead challenge. */
export function assertNetwork(network: string): void {
  if (!isSupportedHederaNetwork(network)) {
    throw new Error(
      `Unsupported x402 network "${network}". Hedera ids are CAIP-2, e.g. "${HEDERA_TESTNET_CAIP2}". ` +
        `Note "hedera-testnet" is NOT valid.`,
    );
  }
}

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

/**
 * Gate a route behind x402. On success, `c.get("payment")` holds the proof.
 *
 * Reads config fresh per-request via `resolveConfig`, rather than closing
 * over a value computed once at module load. Workers has no module-scope
 * `process.env` -- config only exists inside the request's `c.env` -- so
 * anything read at import time is a ReferenceError waiting to happen the
 * moment this runs somewhere other than Node.
 */
export function paymentRequired(resolveConfig: (c: Context) => X402Config): MiddlewareHandler {
  return async (c, next) => {
    const config = resolveConfig(c);
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

/**
 * Tender bidding agent.
 *
 * Acts on behalf of a human principal. It can find work and write a bid, but it
 * pays for every submission and it can never move escrowed funds -- it only
 * *proposes* a release, which the principal approves on a Ledger device
 * (see WorkEscrow.approveRelease).
 *
 * This is the consumer half of Hedera's AI & Agentic Payments track;
 * `services/gateway` is the gated service.
 */

import { type AssuranceLevel } from "@tender/shared";
import { X402Client } from "./x402-client";

export interface AgentConfig {
  gatewayUrl: string;
  /** ENS subname of the agent itself, e.g. `scout.alice.tender.eth`. */
  ens: string;
  /** ENS subname of the human this agent represents. */
  principal: string;
  assurance: AssuranceLevel;
}

export class BiddingAgent {
  private readonly http: X402Client;

  constructor(private readonly config: AgentConfig) {
    this.http = new X402Client(config.gatewayUrl);
  }

  async quote(): Promise<{ priceUsdc: string; asset: string }> {
    const res = await fetch(new URL("/bids/quote", this.config.gatewayUrl));
    if (!res.ok) throw new Error(`Quote failed: ${res.status}`);
    return res.json() as Promise<{ priceUsdc: string; asset: string }>;
  }

  /**
   * Submit a bid. Costs a micropayment, settled by X402Client on the 402 retry.
   */
  async bid(input: { jobId: string; amountUsdc: string; message: string }) {
    return this.http.post("/bids", {
      ...input,
      agent: this.config.ens,
      principal: this.config.principal,
      assurance: this.config.assurance,
    });
  }
}

async function main() {
  const agent = new BiddingAgent({
    gatewayUrl: process.env.GATEWAY_URL ?? "http://localhost:8787",
    ens: process.env.AGENT_ENS ?? "scout.demo.tender.eth",
    principal: process.env.AGENT_PRINCIPAL ?? "demo.tender.eth",
    assurance: "selfie",
  });

  const quote = await agent.quote();
  console.log(`Each bid costs ${quote.priceUsdc} ${quote.asset}.`);

  const result = await agent.bid({
    jobId: process.argv[2] ?? "demo-job",
    amountUsdc: "250.00",
    message: "I have shipped three similar integrations. Happy to start Monday.",
  });
  console.log("Bid accepted:", result);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop() ?? "")) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}

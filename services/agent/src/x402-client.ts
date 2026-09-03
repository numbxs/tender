/**
 * Minimal x402 client: call, expect 402, pay, retry.
 *
 * TODO(day 7): replace `settle` with the real wallet + facilitator call. The
 * request/retry loop around it is already correct, so only `settle` changes.
 */

export interface PaymentRequirements {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  payTo: string;
  asset: string;
  resource: string;
}

export class X402Client {
  constructor(private readonly baseUrl: string) {}

  async post(path: string, body: unknown): Promise<unknown> {
    const url = new URL(path, this.baseUrl);

    const first = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (first.status !== 402) {
      return this.unwrap(first);
    }

    const challenge = (await first.json()) as { accepts?: PaymentRequirements[] };
    const requirements = challenge.accepts?.[0];
    if (!requirements) throw new Error("402 response carried no payment requirements");

    const header = await this.settle(requirements);

    const retry = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-PAYMENT": header },
      body: JSON.stringify(body),
    });

    return this.unwrap(retry);
  }

  /**
   * Pay `requirements` and return the value for the `X-PAYMENT` header.
   *
   * STUB -- returns a synthetic reference so the loop is testable offline.
   * Shipping this unimplemented fails Hedera's track: it requires a *live*
   * x402-gated service with real settlement.
   */
  private async settle(requirements: PaymentRequirements): Promise<string> {
    const ref = `stub-${requirements.network}-${Date.now()}`;
    console.warn(`[x402] STUB settlement of ${requirements.maxAmountRequired} -> ${requirements.payTo}`);
    return ref;
  }

  private async unwrap(res: Response): Promise<unknown> {
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`${res.status} ${res.statusText}: ${detail}`);
    }
    return res.json();
  }
}

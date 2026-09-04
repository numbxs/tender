/**
 * Core domain model. See SPEC.md §3.
 *
 * Amounts are USDC in base units (6 decimals) as bigint. Never use floats for
 * money — `formatUsdc`/`parseUsdc` are the only sanctioned conversions.
 */

export const USDC_DECIMALS = 6;

/** An ENS subname, e.g. `alice.tender.eth`. The primary identifier for both humans and agents. */
export type EnsName = string;

/** 0x-prefixed EVM address. */
export type Address = `0x${string}`;

export type AgreementState =
  | "proposed"
  | "active"
  | "milestone_submitted"
  | "release_pending"
  | "completed"
  | "disputed"
  | "cancelled";

/** Who an identity acts as. An agent always acts *on behalf of* a human. */
export type ActorKind = "human" | "agent";

export interface Identity {
  ens: EnsName;
  address: Address;
  kind: ActorKind;
  /** For agents: the ENS name of the human they represent. */
  principal?: EnsName;
  /** Highest World assurance level this identity has ever cleared. */
  assurance: AssuranceLevel;
}

/** World's assurance ladder, weakest to strongest. Selfie is the *lowest* level. */
export type AssuranceLevel = "none" | "selfie" | "document" | "orb";

export const ASSURANCE_RANK: Record<AssuranceLevel, number> = {
  none: 0,
  selfie: 1,
  document: 2,
  orb: 3,
};

export interface Job {
  id: string;
  client: EnsName;
  title: string;
  scope: string;
  budgetUsdc: bigint;
  deadline: Date;
  /** Minimum assurance a bidder's principal must hold. */
  minAssurance: AssuranceLevel;
  createdAt: Date;
}

export interface Bid {
  id: string;
  jobId: string;
  /** The agent that submitted it. */
  agent: EnsName;
  /** The human it bids on behalf of. */
  principal: EnsName;
  amountUsdc: bigint;
  message: string;
  /** x402 settlement reference proving this bid was paid for. */
  paymentRef: string;
  submittedAt: Date;
}

export interface Milestone {
  index: number;
  description: string;
  amountUsdc: bigint;
  funded: boolean;
  submittedAt?: Date;
  releasedAt?: Date;
}

export interface Agreement {
  id: string;
  jobId: string;
  client: EnsName;
  freelancer: EnsName;
  state: AgreementState;
  milestones: Milestone[];
  /**
   * Hash of the private terms. The terms themselves never leave the TEE —
   * the registry only records that a Confidential Workflow saw both parties
   * agree to this hash. See SPEC.md §7.
   */
  termsHash: `0x${string}`;
  /** Set once the CRE workflow has attested onchain. */
  attestationTx?: `0x${string}`;
  createdAt: Date;
}

/**
 * Arc native wei per USDC base unit.
 *
 * Arc keeps two representations of the same balance, verified against the live
 * chain (ratio measured as exactly 1e12):
 *   - native value  — msg.value, address.balance — 18 decimals
 *   - USDC precompile view — balanceOf/decimals   —  6 decimals
 *
 * Domain amounts are always 6dp USDC base units. Cross into native value only
 * through `toNativeWei`, and never send a 6dp figure as msg.value: a 100 USDC
 * milestone funded with the unscaled number is 1e-10 USDC of dust.
 */
export const NATIVE_PER_USDC = 1_000_000_000_000n;

/** USDC base units (6dp) -> Arc native wei (18dp). */
export function toNativeWei(usdcBaseUnits: bigint): bigint {
  return usdcBaseUnits * NATIVE_PER_USDC;
}

/** Arc native wei (18dp) -> USDC base units (6dp). Truncates sub-unit dust. */
export function fromNativeWei(wei: bigint): bigint {
  return wei / NATIVE_PER_USDC;
}

export function formatUsdc(base: bigint): string {
  const unit = 10n ** BigInt(USDC_DECIMALS);
  const whole = base / unit;
  const frac = (base % unit).toString().padStart(USDC_DECIMALS, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

export function parseUsdc(value: string): bigint {
  const [whole = "0", frac = ""] = value.split(".");
  if (frac.length > USDC_DECIMALS) {
    throw new Error(`USDC supports at most ${USDC_DECIMALS} decimals, got "${value}"`);
  }
  return BigInt(whole) * 10n ** BigInt(USDC_DECIMALS) + BigInt(frac.padEnd(USDC_DECIMALS, "0") || "0");
}

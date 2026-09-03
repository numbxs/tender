/**
 * The risk gate. See SPEC.md §6.
 *
 * This module is the World Selfie Check submission. The whole brief is that a
 * selfie must *change what the product allows* — World asks for a risk and
 * eligibility signal, naming risk, fairness, continuity and abuse prevention.
 * Gating sign-in misreads the product and does not place.
 *
 * So the policy lives here as typed, testable code rather than as an `if`
 * buried in a component: every consequential action resolves to a requirement,
 * and the requirement decides what happens next.
 *
 * Note that Selfie Check returns *medium-assurance* uniqueness and is the
 * lowest rung of World's ladder. Treat it as a signal, never as an identity.
 */

import { ASSURANCE_RANK, type AssuranceLevel } from "./domain";

/** What the user must clear before an action proceeds. */
export type GateRequirement =
  | "none"
  /** Prove a live human is present. */
  | "selfie"
  /** Prove a live human is present, then prove they consented on a Ledger device. */
  | "selfie_and_device";

/** Actions the product can take. Only some are consequential. */
export type Action =
  | { kind: "browse" }
  | { kind: "post_job" }
  | { kind: "submit_bid" }
  | { kind: "accept_bid" }
  | { kind: "fund_milestone"; amountUsdc: bigint }
  | { kind: "release_milestone"; amountUsdc: bigint; counterpartyIsNew: boolean }
  | { kind: "authorize_agent_spend"; limitUsdc: bigint }
  | { kind: "raise_dispute" }
  | { kind: "recover_account" };

/**
 * Releases at or above this move real money to someone else, so they get the
 * full two-factor gate. Below it, the flow stays frictionless — which is the
 * point: a gate that fires on everything is just a login screen with extra steps.
 */
export const RELEASE_GATE_THRESHOLD_USDC = 100_000_000n; // 100 USDC

export interface GateDecision {
  requirement: GateRequirement;
  /** Shown to the user. Explains why they are being asked, never just "verify". */
  reason: string;
}

/**
 * Resolve what a given action requires. Pure and total — every action returns a
 * decision, and the default is deliberately `none`.
 */
export function requiredGate(action: Action): GateDecision {
  switch (action.kind) {
    case "browse":
    case "post_job":
    case "submit_bid":
    case "accept_bid":
    case "fund_milestone":
      // Funding moves money *into* your own escrow — reversible in effect, and
      // gating it would punish the client for participating.
      return { requirement: "none", reason: "" };

    case "release_milestone":
      if (action.counterpartyIsNew) {
        return {
          requirement: "selfie",
          reason: "First payout to this freelancer — a quick selfie protects against account takeover.",
        };
      }
      if (action.amountUsdc >= RELEASE_GATE_THRESHOLD_USDC) {
        return {
          requirement: "selfie_and_device",
          reason: "This release is above your threshold. Confirm you're here, then approve on your Ledger.",
        };
      }
      return { requirement: "none", reason: "" };

    case "authorize_agent_spend":
      // Handing an agent a spending limit is the single most abusable action in
      // the product, at any amount.
      return {
        requirement: "selfie_and_device",
        reason: "You're giving an agent permission to spend. Confirm you're here, then approve on your Ledger.",
      };

    case "raise_dispute":
      return {
        requirement: "selfie",
        reason: "Disputes are rate-limited to real people to keep them meaningful.",
      };

    case "recover_account":
      return {
        requirement: "selfie",
        reason: "Account recovery requires proof that a live person is making the request.",
      };
  }
}

/** Whether an identity may bid on a job that demands a minimum assurance level. */
export function meetsAssurance(held: AssuranceLevel, required: AssuranceLevel): boolean {
  return ASSURANCE_RANK[held] >= ASSURANCE_RANK[required];
}

/** True when the decision needs a hardware signature as well as a selfie. */
export function needsDeviceApproval(decision: GateDecision): boolean {
  return decision.requirement === "selfie_and_device";
}

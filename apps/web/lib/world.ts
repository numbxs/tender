/**
 * World Selfie Check — the risk gate's verification layer. See SPEC.md §6.
 *
 * The design decision that matters:
 *
 * World returns a `nullifier_hash` that is unique per (app, action). That is the
 * whole uniqueness signal — so the ACTION MUST BE STABLE across users. Scoping
 * an action per-user (e.g. `release-${userId}`) gives every user a different
 * nullifier namespace and destroys the ability to tell whether the same human
 * has been seen before, which is precisely the signal Selfie Check exists to
 * provide.
 *
 * So actions are named after the *kind* of consequential act, not the actor.
 */

export const WORLD_APP_ID = process.env.NEXT_PUBLIC_WORLD_APP_ID;

/** Stable, per-act actions. Never interpolate a user id into these. */
export const WORLD_ACTION = {
  releaseEscrow: "release-escrow",
  firstPayout: "first-payout",
  authorizeAgent: "authorize-agent",
  raiseDispute: "raise-dispute",
  recoverAccount: "recover-account",
} as const;

export type WorldAction = (typeof WORLD_ACTION)[keyof typeof WORLD_ACTION];

/**
 * World's assurance ladder. Selfie is the LOWEST rung and carries only
 * medium-assurance uniqueness — a risk signal, never an identity.
 */
export const VERIFICATION_LEVEL = {
  selfie: "selfie",
  document: "document",
  orb: "orb",
} as const;

export const isWorldConfigured = Boolean(WORLD_APP_ID);

/**
 * ENSv2 identity layer. See SPEC.md §4.
 *
 * ENSv2 is a *tree of registries*, not one flat contract: a name that issues
 * subnames deploys its own registry, and `sub.alice.eth` is a chain of entries
 * linked by subregistry pointers. That is exactly the shape Tender needs, and
 * it is why this is a real ENS integration rather than display names —
 * `records as application data` is the pattern that has actually won.
 *
 * Our tree:
 *
 *   RootRegistry ─► ETHRegistry ─► tender.eth ─► TenderRegistry (ours)
 *                                                    ├── alice.tender.eth      (human)
 *                                                    └── scout.alice.tender.eth (that human's agent)
 *
 * An agent's name sits UNDER its principal's name, so the chain itself encodes
 * "who does this agent act for" — no separate lookup, and it cannot be forged
 * without owning the parent.
 *
 * Addresses below were read from the ENS docs and then verified on Sepolia:
 * every one returns non-empty bytecode. Re-check before trusting them on a
 * different network.
 */

export const ENS_SEPOLIA = {
  rootRegistry: "0x8115186e8f2e0b0281e86ab91f0f48ba90364354",
  ethRegistry: "0xbdc85dd5b15d7ecb354cd7cb6f2c50b4f2c4f0e2",
  ethRegistrar: "0xa88553f454b77203b0d036a05c894d555eaaa2cc",
  batchRegistrar: "0x8b16d15f3e51074d0e06f3cf4a0053f7cb92a7fb",
  publicResolverV2: "0xe7b9a25607e02da8145e4eb1836ca539e53f11f7",
  universalResolverV2: "0x4a1817d13e9cf196f471725176355c1234b63c70",
  /** Implementation behind a VerifiableFactory proxy — this is what we clone. */
  userRegistryImpl: "0x624a25d67b59d587752ebec8dded8827dae52050",
} as const satisfies Record<string, `0x${string}`>;

/**
 * Role bitmap, from ENSv2's RegistryRolesLib. Each role has an `_ADMIN` variant
 * at `role << 128` that grants the right to delegate it.
 */
export const ENS_ROLE = {
  REGISTRAR: 1n << 0n,
  REGISTER_RESERVED: 1n << 4n,
  SET_PARENT: 1n << 8n,
  UNREGISTER: 1n << 12n,
  RENEW: 1n << 16n,
  SET_SUBREGISTRY: 1n << 20n,
  SET_RESOLVER: 1n << 24n,
  SET_URI: 1n << 36n,
  CAN_NAME: 1n << 120n,
  UPGRADE: 1n << 124n,
} as const;

export function adminOf(role: bigint): bigint {
  return role << 128n;
}

/**
 * What a Tender user gets over their own name: they may point it at a resolver,
 * hand it a subregistry (so their agents can live beneath it), and give it up.
 * They deliberately do NOT get REGISTRAR on our registry — only Tender mints
 * top-level subnames, which is what stops one user squatting the namespace.
 */
export const TENDER_USER_ROLES =
  ENS_ROLE.SET_RESOLVER | ENS_ROLE.SET_SUBREGISTRY | ENS_ROLE.UNREGISTER;

/** Registering a name is one call on the parent registry. */
export const REGISTER_ABI = [
  {
    type: "function",
    name: "register",
    stateMutability: "nonpayable",
    inputs: [
      { name: "label", type: "string" },
      { name: "owner", type: "address" },
      { name: "registry", type: "address" },
      { name: "resolver", type: "address" },
      { name: "roleBitmap", type: "uint256" },
      { name: "expiry", type: "uint64" },
    ],
    outputs: [{ name: "tokenId", type: "uint256" }],
  },
  {
    type: "function",
    name: "getOwner",
    stateMutability: "view",
    inputs: [{ name: "anyId", type: "uint256" }],
    outputs: [{ name: "owner", type: "address" }],
  },
  {
    type: "function",
    name: "setResolver",
    stateMutability: "nonpayable",
    inputs: [
      { name: "anyId", type: "uint256" },
      { name: "resolver", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "setSubregistry",
    stateMutability: "nonpayable",
    inputs: [
      { name: "anyId", type: "uint256" },
      { name: "registry", type: "address" },
    ],
    outputs: [],
  },
] as const;

/** Text records Tender stores on a name. This is the "ENS as application data" surface. */
export const TENDER_RECORD_KEYS = {
  /** Chain the user wants to be paid on, as a CAIP-2 id. */
  payoutChain: "tender.payout-chain",
  /** Highest World assurance level this identity has cleared: none|selfie|document|orb. */
  assurance: "tender.assurance",
  /** ENS name of the human an agent acts for. Absent on human names. */
  principal: "tender.principal",
  /** Count of completed agreements — cheap, verifiable reputation. */
  completedAgreements: "tender.completed",
} as const;

export const TENDER_PARENT_NAME = "tender.eth";

export function humanName(label: string): string {
  return `${label}.${TENDER_PARENT_NAME}`;
}

/** Agents live beneath their principal, so the name encodes the relationship. */
export function agentName(agentLabel: string, principalLabel: string): string {
  return `${agentLabel}.${principalLabel}.${TENDER_PARENT_NAME}`;
}

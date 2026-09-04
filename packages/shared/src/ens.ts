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
 * ADDRESS PROVENANCE, because getting this wrong wasted real time on day 2:
 * the first pass here was sourced from a WebFetch summary of the ENS docs
 * page and "verified" only by checking each address had *some* bytecode on
 * Sepolia — which passed for a resolver address that turned out to be the
 * wrong contract entirely (it had code; it just wasn't ensPublicResolver).
 * Having bytecode is not the same as being the right contract.
 *
 * The set below instead comes from `ensdomains/ensjs`'s `l1.ts` client config
 * — the address list the actual ENS client library ships and resolves
 * against — cross-checked against ensdomains/ens-cli, and confirmed against
 * on-chain state: `ensRegistry` here is the exact address that already owns
 * our registered `tender.eth` (see deployments/ens-sepolia.json). The three
 * "official"-looking deployment snapshots committed in the ens-contracts-v2
 * repo itself (sepolia, sepolia-official-v1-*) do NOT match this live state —
 * they are stale or parallel environments. Re-verify against ensjs, not
 * against the repo's own deployments/ folder, if this ever needs updating.
 */

export const ENS_SEPOLIA = {
  registry: "0xBDC85dD5b15D7ecb354cd7cb6f2c50b4f2c4F0E2",
  ethRegistrar: "0xa88553F454b77203B0D036A05c894d555EAAa2Cc",
  /**
   * NOT the resolver to use for pure-v2 self-issued names. PublicResolverV2's
   * isAuthorised() calls NAME_WRAPPER.names(node) and requires a non-empty
   * result — it authorises via the v1 NameWrapper's reverse node->name map, so
   * it only works for names that were WRAPPED under v1 and bridged into v2.
   * A name registered fresh through ETHRegistrar (ours) was never wrapped, so
   * every setText/setAddr/etc call against this resolver reverts for it.
   * Kept only for reference; do not point a Tender name at this address.
   */
  legacyBridgePublicResolver: "0x5239A812ec9A62F46dbb5de8f346C8eFe7553A9f",
  /**
   * The actual v2-native resolver implementation: EnhancedAccessControl-based,
   * deployed per-owner via VerifiableFactory (same pattern as userRegistryImpl),
   * with roles granted at ROOT_RESOURCE applying resolver-instance-wide. This
   * is what Tender deploys ONE instance of and uses for tender.eth and every
   * subname beneath it — see deployments/ens-sepolia.json for the deployed address.
   */
  permissionedResolverImpl: "0x9EAe5C2730a7dD16BDD1DeE6421a1B91e3B0365e",
  universalResolver: "0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe",
  verifiableFactory: "0x10dC6333CDFe1FCEf624c6e0a8221b91804Cd7ef",
  /** Implementation cloned by VerifiableFactory to create a subname registry. */
  userRegistryImpl: "0x624a25d67B59D587752EbEc8DdeD8827dAe52050",
  /** Registration is paid in this token, NOT ETH. address(0) reverts with PaymentTokenNotSupported. */
  usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
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
 * What Tender itself holds over a freshly deployed subname registry: enough to
 * mint, retire and reconfigure subnames under tender.eth, and to upgrade the
 * registry contract later.
 */
export const TENDER_REGISTRY_OWNER_ROLES =
  ENS_ROLE.REGISTRAR |
  adminOf(ENS_ROLE.REGISTRAR) |
  ENS_ROLE.SET_SUBREGISTRY |
  adminOf(ENS_ROLE.SET_SUBREGISTRY) |
  ENS_ROLE.SET_RESOLVER |
  adminOf(ENS_ROLE.SET_RESOLVER) |
  ENS_ROLE.UNREGISTER |
  adminOf(ENS_ROLE.UNREGISTER) |
  ENS_ROLE.RENEW |
  adminOf(ENS_ROLE.RENEW) |
  ENS_ROLE.SET_URI |
  adminOf(ENS_ROLE.SET_URI) |
  ENS_ROLE.UPGRADE;

/**
 * What a Tender user gets over their own name: they may point it at a resolver,
 * hand it a subregistry (so their agents can live beneath it), and give it up.
 * They deliberately do NOT get REGISTRAR on our registry — only Tender mints
 * top-level subnames, which is what stops one user squatting the namespace.
 */
export const TENDER_USER_ROLES =
  ENS_ROLE.SET_RESOLVER | ENS_ROLE.SET_SUBREGISTRY | ENS_ROLE.UNREGISTER;

/** Registering a name, or reconfiguring one you already own, on any IStandardRegistry. */
export const REGISTRY_ABI = [
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

/**
 * VerifiableFactory: deploys a deterministic UUPS proxy and runs its
 * initializer in one call. `outerSalt = keccak256(abi.encode(msg.sender,
 * salt))`, so the resulting address depends on the CALLER too, not salt alone
 * — the same salt from two different accounts yields two different addresses.
 *
 * `sender` and `proxyAddress` ARE indexed (confirmed against the actual
 * on-chain topics, not assumed) — get this wrong and naive byte-slicing of
 * `data` silently extracts nonsense that happens to look address-shaped. Use
 * `decodeEventLog`, never hand-rolled offsets, to read `ProxyDeployed`.
 */
export const VERIFIABLE_FACTORY_ABI = [
  {
    type: "function",
    name: "deployProxy",
    stateMutability: "nonpayable",
    inputs: [
      { name: "implementation", type: "address" },
      { name: "salt", type: "uint256" },
      { name: "data", type: "bytes" },
    ],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "event",
    name: "ProxyDeployed",
    inputs: [
      { name: "sender", type: "address", indexed: true },
      { name: "proxyAddress", type: "address", indexed: true },
      { name: "salt", type: "uint256", indexed: false },
      { name: "implementation", type: "address", indexed: false },
    ],
  },
] as const;

/** UserRegistry's one-time initializer: grants `roleBitmap` at ROOT_RESOURCE to `rootAccount`. */
export const USER_REGISTRY_INIT_ABI = [
  {
    type: "function",
    name: "initialize",
    stateMutability: "nonpayable",
    inputs: [
      { name: "rootAccount", type: "address" },
      { name: "roleBitmap", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

/**
 * PermissionedResolver's one-time initializer. `setters` is a multicall of
 * further init calls to run atomically with the grant; Tender always passes
 * `[]` and issues records as separate transactions afterward.
 */
export const PERMISSIONED_RESOLVER_INIT_ABI = [
  {
    type: "function",
    name: "initialize",
    stateMutability: "nonpayable",
    inputs: [
      { name: "admin", type: "address" },
      { name: "roleBitmap", type: "uint256" },
      { name: "setters", type: "bytes[]" },
    ],
    outputs: [],
  },
] as const;

/** PermissionedResolver role bitmap, from PermissionedResolverLib. */
export const RESOLVER_ROLE = {
  SET_ADDR: 1n << 0n,
  SET_TEXT: 1n << 4n,
  SET_CONTENTHASH: 1n << 8n,
  SET_ABI: 1n << 16n,
  UPGRADE: 1n << 124n,
} as const;

/**
 * What Tender's resolver admin (the deployer) holds. Granted at ROOT_RESOURCE,
 * which — per PermissionedResolver's `_checkRoles` override — authorises the
 * holder for every node in this resolver instance, not just one name. One
 * instance, one admin, serves tender.eth and every name beneath it.
 */
export const TENDER_RESOLVER_ADMIN_ROLES =
  RESOLVER_ROLE.SET_ADDR |
  adminOf(RESOLVER_ROLE.SET_ADDR) |
  RESOLVER_ROLE.SET_TEXT |
  adminOf(RESOLVER_ROLE.SET_TEXT) |
  RESOLVER_ROLE.SET_CONTENTHASH |
  adminOf(RESOLVER_ROLE.SET_CONTENTHASH) |
  RESOLVER_ROLE.UPGRADE;

/** The v2-native resolver's record surface — this is the "ENS as application data" API. */
export const RESOLVER_ABI = [
  {
    type: "function",
    name: "setText",
    stateMutability: "nonpayable",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "key", type: "string" },
      { name: "value", type: "string" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "text",
    stateMutability: "view",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "key", type: "string" },
    ],
    outputs: [{ name: "", type: "string" }],
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

/**
 * B3/B4: give tender.eth the power to issue subnames, mint the first one, and
 * write records on it. Six on-chain moves, in order:
 *
 *   1. Deploy a subname registry (UserRegistryImpl via VerifiableFactory) and
 *      wire it under tender.eth via setSubregistry — this is what actually
 *      makes `*.tender.eth` resolvable.
 *   2. Deploy Tender's own resolver (PermissionedResolverImpl via the same
 *      factory) and point tender.eth at it.
 *
 *      NOT PublicResolverV2, despite the name being tempting: its
 *      isAuthorised() requires NAME_WRAPPER.names(node) to be non-empty — it
 *      is the bridge resolver for names wrapped under the legacy v1
 *      NameWrapper, and every setText/setAddr call against it reverts for a
 *      name that (like ours) was issued fresh through ENSv2. The real
 *      v2-native resolver is PermissionedResolver: EnhancedAccessControl
 *      based, deployed per-owner via the same factory pattern as the
 *      registry. Roles granted at ROOT_RESOURCE apply resolver-instance-wide,
 *      so ONE deployed instance serves tender.eth and every name beneath it.
 *      See ens.ts for the full provenance note on both addresses.
 *
 *   3. Mint a demo subname, alice.tender.eth, with TENDER_USER_ROLES — not
 *      REGISTRAR, since only Tender mints top-level subnames under itself.
 *   4. Write two text records on it and read every one back before declaring
 *      success. A `status: success` receipt only proves the EVM accepted the
 *      call; it does not prove the call reached real contract code — a call
 *      to an address with no bytecode also returns success and does nothing.
 *      This bit us once already deriving a proxy address from a factory
 *      event: `VerifiableFactory.ProxyDeployed`'s `sender` and `proxyAddress`
 *      are INDEXED (confirmed against on-chain topics, not assumed), and an
 *      earlier version of this script assumed all four params were
 *      non-indexed, hand-sliced `data` on that wrong assumption, and silently
 *      wrote every step to the tail bytes of `salt` — which happened to look
 *      exactly like a plausible address. `decodeEventLog` below replaces that
 *      slicing, and every write is followed by an independent read.
 *
 *   pnpm ens:setup
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: new URL("../../.env.local", import.meta.url).pathname });

import {
  createPublicClient, createWalletClient, http, keccak256, toBytes,
  encodeFunctionData, decodeEventLog, type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import {
  ENS_SEPOLIA, REGISTRY_ABI, VERIFIABLE_FACTORY_ABI, USER_REGISTRY_INIT_ABI,
  PERMISSIONED_RESOLVER_INIT_ABI, RESOLVER_ABI,
  TENDER_REGISTRY_OWNER_ROLES, TENDER_RESOLVER_ADMIN_ROLES, TENDER_USER_ROLES,
  TENDER_RECORD_KEYS, humanName,
} from "@tender/shared";

const LABEL = "tender";
const DEMO_LABEL = "alice";
const NO_SUBREGISTRY = "0x0000000000000000000000000000000000000000" as const;

function namehash(name: string): Hex {
  let node: Hex = `0x${"00".repeat(32)}`;
  if (name) {
    const labels = name.split(".");
    for (let i = labels.length - 1; i >= 0; i--) {
      const labelHash = keccak256(toBytes(labels[i]!));
      node = keccak256(`0x${node.slice(2)}${labelHash.slice(2)}` as Hex);
    }
  }
  return node;
}

async function main() {
  const rpc = process.env.SEPOLIA_RPC_URL;
  const key = process.env.ARC_DEPLOYER_PRIVATE_KEY;
  if (!rpc) throw new Error("SEPOLIA_RPC_URL is not set (see .env.local)");
  if (!key) throw new Error("ARC_DEPLOYER_PRIVATE_KEY is not set (see .env.local)");

  const account = privateKeyToAccount(key as Hex);
  const transport = http(rpc);
  const pub = createPublicClient({ chain: sepolia, transport });
  const wallet = createWalletClient({ account, chain: sepolia, transport });

  const tenderTokenId = BigInt(keccak256(toBytes(LABEL)));
  const aliceTokenId = BigInt(keccak256(toBytes(DEMO_LABEL)));

  const owner = await pub.readContract({
    address: ENS_SEPOLIA.registry, abi: REGISTRY_ABI, functionName: "getOwner", args: [tenderTokenId],
  });
  if (owner.toLowerCase() !== account.address.toLowerCase()) {
    throw new Error(`${account.address} does not own tender.eth (owner is ${owner}). Run ens:register first.`);
  }
  console.log(`tender.eth owner confirmed: ${owner}\n`);

  /** Deploy via the factory and pull the real address out of the receipt's logs. */
  async function deployProxy(implementation: Hex, saltSeed: string, initData: Hex): Promise<Hex> {
    const salt = BigInt(keccak256(toBytes(saltSeed)));
    const hash = await wallet.writeContract({
      address: ENS_SEPOLIA.verifiableFactory, abi: VERIFIABLE_FACTORY_ABI, functionName: "deployProxy",
      args: [implementation, salt, initData],
    });
    const receipt = await pub.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`deployProxy reverted (tx ${hash})`);

    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== ENS_SEPOLIA.verifiableFactory.toLowerCase()) continue;
      try {
        const decoded = decodeEventLog({ abi: VERIFIABLE_FACTORY_ABI, ...log });
        if (decoded.eventName === "ProxyDeployed") {
          const code = await pub.getCode({ address: decoded.args.proxyAddress });
          if (!code || code === "0x") throw new Error(`Deployed proxy ${decoded.args.proxyAddress} has no code`);
          console.log(`     ${hash}`);
          console.log(`     deployed at ${decoded.args.proxyAddress}  (${(code.length - 2) / 2} bytes, verified)\n`);
          return decoded.args.proxyAddress;
        }
      } catch (e) {
        if (e instanceof Error && e.message.includes("has no code")) throw e;
        // not this event, keep scanning
      }
    }
    throw new Error(`ProxyDeployed not found in receipt for ${hash}`);
  }

  console.log("1/6 deployProxy(UserRegistryImpl) — creating TenderRegistry");
  const registryInit = encodeFunctionData({
    abi: USER_REGISTRY_INIT_ABI, functionName: "initialize",
    args: [account.address, TENDER_REGISTRY_OWNER_ROLES],
  });
  const tenderRegistry = await deployProxy(ENS_SEPOLIA.userRegistryImpl, "tender.eth-registry-v1", registryInit);

  console.log("2/6 deployProxy(PermissionedResolverImpl) — creating TenderResolver");
  const resolverInit = encodeFunctionData({
    abi: PERMISSIONED_RESOLVER_INIT_ABI, functionName: "initialize",
    args: [account.address, TENDER_RESOLVER_ADMIN_ROLES, []],
  });
  const tenderResolver = await deployProxy(ENS_SEPOLIA.permissionedResolverImpl, "tender.eth-resolver-v1", resolverInit);

  console.log("3/6 setSubregistry(tender.eth, TenderRegistry)");
  const h3 = await wallet.writeContract({
    address: ENS_SEPOLIA.registry, abi: REGISTRY_ABI, functionName: "setSubregistry",
    args: [tenderTokenId, tenderRegistry],
  });
  await pub.waitForTransactionReceipt({ hash: h3 });
  console.log(`     ${h3}\n`);

  console.log("4/6 setResolver(tender.eth, TenderResolver)");
  const h4 = await wallet.writeContract({
    address: ENS_SEPOLIA.registry, abi: REGISTRY_ABI, functionName: "setResolver",
    args: [tenderTokenId, tenderResolver],
  });
  await pub.waitForTransactionReceipt({ hash: h4 });
  console.log(`     ${h4}\n`);

  console.log(`5/6 register("${DEMO_LABEL}") on TenderRegistry — minting ${humanName(DEMO_LABEL)}`);
  const oneYear = 365n * 24n * 60n * 60n;
  const expiry = BigInt(Math.floor(Date.now() / 1000)) + oneYear;
  const h5 = await wallet.writeContract({
    address: tenderRegistry, abi: REGISTRY_ABI, functionName: "register",
    args: [DEMO_LABEL, account.address, NO_SUBREGISTRY, tenderResolver, TENDER_USER_ROLES, expiry],
  });
  await pub.waitForTransactionReceipt({ hash: h5 });
  const mintedOwner = await pub.readContract({
    address: tenderRegistry, abi: REGISTRY_ABI, functionName: "getOwner", args: [aliceTokenId],
  });
  if (mintedOwner.toLowerCase() !== account.address.toLowerCase()) {
    throw new Error(`register() reported success but getOwner returned ${mintedOwner}, not us.`);
  }
  console.log(`     ${h5}  (verified: getOwner -> ${mintedOwner})\n`);

  console.log("6/6 setText — payout-chain, assurance — reading each back before continuing");
  const node = namehash(humanName(DEMO_LABEL));
  const records: [string, string][] = [
    [TENDER_RECORD_KEYS.payoutChain, "eip155:5042002"], // Arc testnet
    [TENDER_RECORD_KEYS.assurance, "none"],
  ];
  for (const [k, v] of records) {
    const h = await wallet.writeContract({
      address: tenderResolver, abi: RESOLVER_ABI, functionName: "setText", args: [node, k, v],
    });
    await pub.waitForTransactionReceipt({ hash: h });
    const readBack = await pub.readContract({
      address: tenderResolver, abi: RESOLVER_ABI, functionName: "text", args: [node, k],
    });
    if (readBack !== v) throw new Error(`Wrote "${v}" for ${k} but read back "${readBack}".`);
    console.log(`     ${k} = "${readBack}"  ✓  (${h})`);
  }

  console.log(`\n✅ ${humanName(DEMO_LABEL)} is live: minted, resolvable, every record read back.`);
  console.log(`   TenderRegistry: ${tenderRegistry}`);
  console.log(`   TenderResolver: ${tenderResolver}`);
  console.log(`   node: ${node}`);
}

main().catch((e) => {
  console.error(`\n✗ ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});

/**
 * Register `tender.eth` on ENSv2 (Sepolia) — the root of Tender's namespace.
 *
 * ENSv2 uses commit-reveal, so this is a three-step transaction sequence with a
 * mandatory wait in the middle:
 *
 *   1. approve USDC to the registrar   (registration is paid in USDC, not ETH)
 *   2. commit(makeCommitment(...))     then wait MIN_COMMITMENT_AGE (60s)
 *   3. register(...)                   within MAX_COMMITMENT_AGE (24h)
 *
 * The secret must be identical between steps 2 and 3, so it is generated once
 * and reused. Losing it between steps means waiting out the commitment and
 * starting over.
 *
 *   pnpm ens:register            # 1 year,  ~8.00 USDC
 *   pnpm ens:register --days 28  # 28 days, ~0.61 USDC
 */

import { config as loadEnv } from "dotenv";

// Secrets live in .env.local, which dotenv does not read by default.
loadEnv({ path: new URL("../../.env.local", import.meta.url).pathname });
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  formatUnits,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const LABEL = "tender";
const REGISTRAR = "0xa88553f454b77203b0d036a05c894d555eaaa2cc" as const;
const RESOLVER = "0xe7b9a25607e02da8145e4eb1836ca539e53f11f7" as const; // PublicResolverV2
const USDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as const; // the only accepted token
const NO_SUBREGISTRY = "0x0000000000000000000000000000000000000000" as const;
const NO_REFERRER = `0x${"00".repeat(32)}` as Hex;

const REGISTRAR_ABI = parseAbi([
  "function isAvailable(string label) view returns (bool)",
  "function getRegisterPrice(string label, uint64 duration, address paymentToken) view returns (uint256 base, uint256 premium)",
  "function makeCommitment(string label, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, bytes32 referrer) pure returns (bytes32)",
  "function commit(bytes32 commitment)",
  "function commitmentAt(bytes32 commitment) view returns (uint64)",
  "function register(string label, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, address paymentToken, bytes32 referrer) returns (uint256)",
  "function MIN_COMMITMENT_AGE() view returns (uint64)",
]);

const ERC20_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const rpc = process.env.SEPOLIA_RPC_URL;
  const key = process.env.ARC_DEPLOYER_PRIVATE_KEY;
  if (!rpc) throw new Error("SEPOLIA_RPC_URL is not set (see .env.local)");
  if (!key) throw new Error("ARC_DEPLOYER_PRIVATE_KEY is not set (see .env.local)");

  const account = privateKeyToAccount(key as Hex);
  const transport = http(rpc);
  const pub = createPublicClient({ chain: sepolia, transport });
  const wallet = createWalletClient({ account, chain: sepolia, transport });

  const days = Number(arg("days") ?? 365);
  const duration = BigInt(days * 24 * 60 * 60);

  console.log(`registering  ${LABEL}.eth`);
  console.log(`owner        ${account.address}`);
  console.log(`duration     ${days} days`);

  const available = await pub.readContract({
    address: REGISTRAR, abi: REGISTRAR_ABI, functionName: "isAvailable", args: [LABEL],
  });
  if (!available) throw new Error(`${LABEL}.eth is not available`);

  const [base, premium] = await pub.readContract({
    address: REGISTRAR, abi: REGISTRAR_ABI, functionName: "getRegisterPrice",
    args: [LABEL, duration, USDC],
  });
  const total = base + premium;
  console.log(`price        ${formatUnits(total, 6)} USDC`);

  const balance = await pub.readContract({
    address: USDC, abi: ERC20_ABI, functionName: "balanceOf", args: [account.address],
  });
  console.log(`balance      ${formatUnits(balance, 6)} USDC`);
  if (balance < total) {
    throw new Error(
      `Not enough USDC. Need ${formatUnits(total, 6)}, have ${formatUnits(balance, 6)}. ` +
        `Get Sepolia USDC from https://faucet.circle.com (select Ethereum Sepolia).`,
    );
  }

  // 1. Approve — the registrar pulls USDC during register().
  const allowance = await pub.readContract({
    address: USDC, abi: ERC20_ABI, functionName: "allowance", args: [account.address, REGISTRAR],
  });
  if (allowance < total) {
    console.log("\n1/3 approve");
    const hash = await wallet.writeContract({
      address: USDC, abi: ERC20_ABI, functionName: "approve", args: [REGISTRAR, total],
    });
    await pub.waitForTransactionReceipt({ hash });
    console.log(`    ${hash}`);
  } else {
    console.log("\n1/3 approve — already sufficient, skipping");
  }

  // 2. Commit. The secret must survive until step 3.
  const secret = `0x${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex")}` as Hex;
  const commitment = await pub.readContract({
    address: REGISTRAR, abi: REGISTRAR_ABI, functionName: "makeCommitment",
    args: [LABEL, account.address, secret, NO_SUBREGISTRY, RESOLVER, duration, NO_REFERRER],
  });

  console.log("\n2/3 commit");
  const commitHash = await wallet.writeContract({
    address: REGISTRAR, abi: REGISTRAR_ABI, functionName: "commit", args: [commitment],
  });
  await pub.waitForTransactionReceipt({ hash: commitHash });
  console.log(`    ${commitHash}`);

  const minAge = await pub.readContract({
    address: REGISTRAR, abi: REGISTRAR_ABI, functionName: "MIN_COMMITMENT_AGE",
  });
  const waitSec = Number(minAge) + 5;
  console.log(`    waiting ${waitSec}s for the commitment to mature…`);
  await sleep(waitSec * 1000);

  // 3. Reveal.
  console.log("\n3/3 register");
  const regHash = await wallet.writeContract({
    address: REGISTRAR, abi: REGISTRAR_ABI, functionName: "register",
    args: [LABEL, account.address, secret, NO_SUBREGISTRY, RESOLVER, duration, USDC, NO_REFERRER],
  });
  const receipt = await pub.waitForTransactionReceipt({ hash: regHash });
  console.log(`    ${regHash}  status=${receipt.status}`);

  if (receipt.status !== "success") throw new Error("register reverted");
  console.log(`\n✅ ${LABEL}.eth registered to ${account.address}`);
  console.log(`   https://sepolia.etherscan.io/tx/${regHash}`);
  console.log(`\nNext: deploy the subname registry and point tender.eth at it (B3).`);
}

main().catch((e) => {
  console.error(`\n✗ ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});

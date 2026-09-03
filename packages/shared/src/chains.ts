/**
 * Chain configuration.
 *
 * Tender spans three chains, each for a reason (SPEC §4):
 *   Arc      — settlement. Escrow and milestone payouts.
 *   Sepolia  — identity. ENSv2 subnames.
 *   Hedera   — metering. The x402-gated bid service.
 */

export interface ChainConfig {
  id: number;
  name: string;
  rpcUrl: string;
  explorer?: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
}

function env(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing required env var: ${name}. See .env.example`);
  return value;
}

// ─── Arc: settlement ────────────────────────────────────────────────────────
export const ARC_TESTNET_CHAIN_ID = 5042002;

/**
 * On Arc, USDC IS the native gas token, exposed at this precompile with an ERC-20
 * read interface (name/symbol/decimals/balanceOf/allowance/totalSupply all answer).
 *
 * The address has NO bytecode selectors — calls are intercepted natively — so do NOT
 * assume approve()/transferFrom() behave like a normal token. WorkEscrow therefore
 * settles in native value and never calls this contract. Use it for reading balances
 * only, and verify any write path on-chain before depending on it.
 */
export const ARC_USDC_PRECOMPILE = "0x3600000000000000000000000000000000000000" as const;

export function arc(): ChainConfig {
  return {
    id: Number(env("ARC_CHAIN_ID", String(ARC_TESTNET_CHAIN_ID))),
    name: "Arc Testnet",
    rpcUrl: env("ARC_RPC_URL", "https://rpc.testnet.arc.network"),
    explorer: "https://explorer.testnet.arc.network",
    nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 6 },
  };
}

// ─── Sepolia: identity ──────────────────────────────────────────────────────
export const SEPOLIA_CHAIN_ID = 11155111;

export function sepolia(): ChainConfig {
  return {
    id: SEPOLIA_CHAIN_ID,
    name: "Sepolia",
    rpcUrl: env("SEPOLIA_RPC_URL"),
    explorer: "https://sepolia.etherscan.io",
    nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
  };
}

// ─── Hedera: metering ───────────────────────────────────────────────────────
export const HEDERA_TESTNET_CHAIN_ID = 296;

export function hederaTestnet(): ChainConfig {
  return {
    id: HEDERA_TESTNET_CHAIN_ID,
    name: "Hedera Testnet",
    rpcUrl: env("HEDERA_RPC_URL", "https://testnet.hashio.io/api"),
    explorer: "https://hashscan.io/testnet",
    nativeCurrency: { name: "HBAR", symbol: "HBAR", decimals: 18 },
  };
}

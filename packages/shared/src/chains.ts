/**
 * Chain configuration.
 *
 * Arc's testnet chain ID and USDC address are NOT yet verified against Arc's
 * docs — see SPEC.md §11. They stay env-driven until someone confirms them;
 * do not hardcode a guess.
 */

export interface ChainConfig {
  id: number;
  name: string;
  rpcUrl: string;
  /** USDC contract, where the chain is a settlement venue. */
  usdc?: `0x${string}`;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}. See .env.example`);
  return value;
}

function optionalNumber(name: string): number {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}. See .env.example`);
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`${name} must be an integer, got "${value}"`);
  return parsed;
}

/** Settlement. Escrow and milestone payouts live here. */
export function arc(): ChainConfig {
  return {
    id: optionalNumber("ARC_CHAIN_ID"),
    name: "Arc Testnet",
    rpcUrl: required("ARC_RPC_URL"),
    usdc: required("ARC_USDC_ADDRESS") as `0x${string}`,
  };
}

/** Identity. ENSv2 subnames are minted here. */
export function sepolia(): ChainConfig {
  return {
    id: 11155111,
    name: "Sepolia",
    rpcUrl: required("SEPOLIA_RPC_URL"),
  };
}

/** Metering and tokenised claims. Hedera testnet's EVM chain ID is 296. */
export const HEDERA_TESTNET_CHAIN_ID = 296;

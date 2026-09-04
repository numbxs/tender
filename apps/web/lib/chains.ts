import { defineChain } from "viem";
import { ARC_TESTNET_CHAIN_ID } from "@tender/shared";

/**
 * Arc testnet as a viem chain.
 *
 * Privy does not ship this chain, so it has to be registered explicitly.
 * Note `nativeCurrency` is USDC with 18 decimals: on Arc, USDC *is* gas, and
 * native value is 18dp even though the USDC precompile's view is 6dp. Declaring
 * 6 here would make every balance the UI renders wrong by a factor of 1e12.
 */
export const arcTestnet = defineChain({
  id: ARC_TESTNET_CHAIN_ID,
  name: "Arc Testnet",
  nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.testnet.arc.network"] },
  },
  blockExplorers: {
    default: { name: "ArcScan", url: "https://explorer.testnet.arc.network" },
  },
  testnet: true,
});

"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { sepolia } from "viem/chains";
import { arcTestnet } from "@/lib/chains";

/**
 * Privy is the onboarding layer (SPEC §4). The target is a freelancer who logs
 * in with an email and never sees a seed phrase — Privy is judged on mainstream
 * accessibility and a clear user journey, so the wallet should be invisible.
 *
 * Tender is multi-chain by design: Arc settles, Sepolia carries ENS identity.
 * Arc is the default because that is where a user's money moves.
 */

// Referenced in full so Next inlines it at build time.
const APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

export function Providers({ children }: { children: React.ReactNode }) {
  // Render without Privy rather than crashing, so the app boots for anyone who
  // has not set up their env yet. SetupNotice tells them what is missing.
  if (!APP_ID) return <>{children}</>;

  return (
    <PrivyProvider
      appId={APP_ID}
      config={{
        loginMethods: ["email", "google"],
        embeddedWallets: {
          // Nested under `ethereum` in this SDK version.
          ethereum: { createOnLogin: "users-without-wallets" },
          showWalletUIs: false,
        },
        defaultChain: arcTestnet,
        supportedChains: [arcTestnet, sepolia],
        appearance: {
          theme: "light",
          accentColor: "#1e6b54",
          logo: undefined,
          walletList: [],
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}

export const isPrivyConfigured = Boolean(APP_ID);

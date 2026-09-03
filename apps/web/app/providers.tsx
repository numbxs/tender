"use client";

/**
 * App providers.
 *
 * TODO(day 1): wrap in PrivyProvider. Privy is judged on polish and mainstream
 * accessibility -- the target is email login into an embedded wallet with the
 * freelancer never seeing a seed phrase (SPEC §4).
 *
 *   <PrivyProvider
 *     appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
 *     config={{ embeddedWallets: { createOnLogin: "users-without-wallets" } }}
 *   >
 *     {children}
 *   </PrivyProvider>
 */

export function Providers({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

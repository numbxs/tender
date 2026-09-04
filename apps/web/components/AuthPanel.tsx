"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { humanName } from "@tender/shared";

/**
 * Login surface. The whole point is that a freelancer signs in with an email and
 * ends up holding a wallet without ever meeting one — Privy is scored on exactly
 * that (SPEC §4), so this deliberately shows an identity, not an address.
 *
 * TODO(B3): the ENS name is derived from the email label right now. Once subname
 * minting lands it must come from the registry, which is the real claim.
 */
export function AuthPanel() {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const { wallets } = useWallets();

  if (!ready) return <div className="panel muted">Loading…</div>;

  if (!authenticated) {
    return (
      <div className="panel">
        <h2>Sign in</h2>
        <p className="muted">
          Email or Google. A wallet is created for you — there is no seed phrase to write down.
        </p>
        <button className="primary" onClick={login}>
          Sign in
        </button>
      </div>
    );
  }

  const email = user?.email?.address ?? user?.google?.email;
  const label = email?.split("@")[0]?.replace(/[^a-z0-9-]/gi, "").toLowerCase();
  const wallet = wallets[0];

  return (
    <div className="panel">
      <h2>Signed in</h2>
      <dl className="kv">
        {email && (
          <>
            <dt>Account</dt>
            <dd>{email}</dd>
          </>
        )}
        {label && (
          <>
            <dt>Identity</dt>
            <dd>
              {humanName(label)} <span className="pending">not yet minted</span>
            </dd>
          </>
        )}
        <dt>Wallet</dt>
        <dd className="mono">{wallet ? wallet.address : "creating…"}</dd>
      </dl>
      <button onClick={logout}>Sign out</button>
    </div>
  );
}

import { AuthPanel } from "@/components/AuthPanel";
import { SetupNotice } from "@/components/SetupNotice";
import { WorldGateDemo } from "@/components/WorldGateDemo";

const missing = [
  ["NEXT_PUBLIC_PRIVY_APP_ID", process.env.NEXT_PUBLIC_PRIVY_APP_ID],
  ["NEXT_PUBLIC_SEPOLIA_RPC_URL", process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL],
]
  .filter(([, v]) => !v)
  .map(([k]) => k as string);

export default function Home() {
  return (
    <main>
      <header className="hero">
        <p className="eyebrow">ETHOnline 2026</p>
        <h1>Tender</h1>
        <p className="lede">
          Job marketplaces are drowning in AI-generated applications. Tender makes every bid cost a
          fraction of a cent and carry proof that a real human stands behind it — then settles the
          work onchain without either party publishing their terms.
        </p>
      </header>

      {missing.length > 0 && <SetupNotice missing={missing} />}

      {/* Privy hooks throw outside PrivyProvider, and Providers omits the provider
          when there is no app id -- so the panel only mounts once it is configured. */}
      {process.env.NEXT_PUBLIC_PRIVY_APP_ID && <AuthPanel />}

      <section>
        <h2>World Selfie Check</h2>
        <p className="muted">
          Live against World's v4 API — not a mock. Gates a consequential action, per SPEC §6.
        </p>
        <WorldGateDemo />
      </section>

      <section>
        <h2>Settlement</h2>
        <p className="muted">Live on Arc testnet — escrow, milestones and release.</p>
        <dl className="kv">
          <dt>WorkEscrow</dt>
          <dd className="mono">0xB3BCed454ae4fE21bD1565F99B88c93CE346E178</dd>
          <dt>AgreementRegistry</dt>
          <dd className="mono">0x418334198D6471E68E398F83F10Bad71C3beC56e</dd>
        </dl>
      </section>
    </main>
  );
}

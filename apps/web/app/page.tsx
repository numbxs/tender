import { requiredGate, formatUsdc, RELEASE_GATE_THRESHOLD_USDC, type Action } from "@tender/shared";

/**
 * Day 0 landing page. It renders the live risk policy from @tender/shared so the
 * core mechanism is visible and checkable from the first commit -- and so a
 * change to the policy is immediately obvious in the UI.
 *
 * TODO(day 3): replace with the real job board.
 */

const SAMPLE_ACTIONS: { label: string; action: Action }[] = [
  { label: "Browse jobs", action: { kind: "browse" } },
  { label: "Post a job", action: { kind: "post_job" } },
  { label: "Submit a bid", action: { kind: "submit_bid" } },
  { label: "Fund a milestone", action: { kind: "fund_milestone", amountUsdc: 500_000_000n } },
  {
    label: "Release $50 to a known freelancer",
    action: { kind: "release_milestone", amountUsdc: 50_000_000n, counterpartyIsNew: false },
  },
  {
    label: "Release $50 to a new freelancer",
    action: { kind: "release_milestone", amountUsdc: 50_000_000n, counterpartyIsNew: true },
  },
  {
    label: "Release $500 to a known freelancer",
    action: { kind: "release_milestone", amountUsdc: 500_000_000n, counterpartyIsNew: false },
  },
  {
    label: "Authorise an agent to spend",
    action: { kind: "authorize_agent_spend", limitUsdc: 100_000_000n },
  },
  { label: "Raise a dispute", action: { kind: "raise_dispute" } },
  { label: "Recover an account", action: { kind: "recover_account" } },
];

const GATE_LABEL: Record<string, string> = {
  none: "—",
  selfie: "Selfie",
  selfie_and_device: "Selfie + Ledger",
};

export default function Home() {
  return (
    <main>
      <p style={{ color: "var(--ink-3)", fontSize: 13, letterSpacing: ".14em", textTransform: "uppercase" }}>
        ETHOnline 2026
      </p>
      <h1 style={{ fontSize: 44, letterSpacing: "-0.03em", margin: "8px 0 0" }}>Tender</h1>
      <p style={{ fontSize: 19, color: "var(--ink-2)", maxWidth: "62ch" }}>
        Job marketplaces are drowning in AI-generated applications. Tender makes every bid cost a
        fraction of a cent and carry proof that a real human stands behind it — then settles the
        work onchain without either party publishing their terms.
      </p>

      <h2 style={{ fontSize: 22, marginTop: 48, letterSpacing: "-0.02em" }}>Risk policy</h2>
      <p style={{ color: "var(--ink-2)", maxWidth: "62ch" }}>
        Rendered live from <code>@tender/shared</code>. A selfie has to <em>change what the product
        allows</em> — so most actions are deliberately ungated. Releases at or above{" "}
        {formatUsdc(RELEASE_GATE_THRESHOLD_USDC)} USDC take the full two-factor gate.
      </p>

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 20, fontSize: 15 }}>
        <thead>
          <tr>
            <th style={th}>Action</th>
            <th style={th}>Gate</th>
            <th style={th}>Reason shown to the user</th>
          </tr>
        </thead>
        <tbody>
          {SAMPLE_ACTIONS.map(({ label, action }) => {
            const decision = requiredGate(action);
            const gated = decision.requirement !== "none";
            return (
              <tr key={label}>
                <td style={td}>{label}</td>
                <td style={{ ...td, color: gated ? "var(--signal)" : "var(--ink-3)", whiteSpace: "nowrap" }}>
                  {GATE_LABEL[decision.requirement]}
                </td>
                <td style={{ ...td, color: "var(--ink-3)" }}>{decision.reason || "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </main>
  );
}

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 12px",
  borderBottom: "1px solid var(--rule)",
  fontSize: 11,
  letterSpacing: ".12em",
  textTransform: "uppercase",
  color: "var(--ink-3)",
  fontWeight: 600,
};

const td: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid var(--rule)",
  verticalAlign: "top",
};

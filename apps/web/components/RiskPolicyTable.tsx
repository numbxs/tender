import { requiredGate, formatUsdc, RELEASE_GATE_THRESHOLD_USDC, type Action } from "@tender/shared";

const SAMPLES: { label: string; action: Action }[] = [
  { label: "Browse jobs", action: { kind: "browse" } },
  { label: "Submit a bid", action: { kind: "submit_bid" } },
  { label: "Fund a milestone", action: { kind: "fund_milestone", amountUsdc: 500_000_000n } },
  {
    label: "Release to a known freelancer, under threshold",
    action: { kind: "release_milestone", amountUsdc: 500_000n, counterpartyIsNew: false },
  },
  {
    label: "Release to a new freelancer",
    action: { kind: "release_milestone", amountUsdc: 500_000n, counterpartyIsNew: true },
  },
  {
    label: "Release over threshold",
    action: {
      kind: "release_milestone",
      amountUsdc: RELEASE_GATE_THRESHOLD_USDC * 2n,
      counterpartyIsNew: false,
    },
  },
  {
    label: "Authorise an agent to spend",
    action: { kind: "authorize_agent_spend", limitUsdc: 100_000_000n },
  },
  { label: "Raise a dispute", action: { kind: "raise_dispute" } },
];

const GATE_LABEL: Record<string, string> = {
  none: "—",
  selfie: "Selfie",
  selfie_and_device: "Selfie + Ledger",
};

export function RiskPolicyTable() {
  return (
    <>
      <p className="muted small">
        Threshold: {formatUsdc(RELEASE_GATE_THRESHOLD_USDC)} USDC.
      </p>
      <table>
        <thead>
          <tr>
            <th>Action</th>
            <th>Gate</th>
            <th>Reason shown to the user</th>
          </tr>
        </thead>
        <tbody>
          {SAMPLES.map(({ label, action }) => {
            const d = requiredGate(action);
            return (
              <tr key={label}>
                <td>{label}</td>
                <td className={d.requirement === "none" ? "muted" : "gated"}>
                  {GATE_LABEL[d.requirement]}
                </td>
                <td className="muted">{d.reason || "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

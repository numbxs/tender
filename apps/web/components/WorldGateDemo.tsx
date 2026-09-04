"use client";

import { useState } from "react";
import { WorldVerifyButton } from "./WorldVerifyButton";
import { WORLD_ACTION, isWorldConfigured } from "@/lib/world";
import { requiredGate } from "@tender/shared";

/**
 * Demo entry point for WorldVerifyButton, proving the full loop end to end
 * ahead of the real escrow-release UI existing: sign an rp_context, open
 * IDKit for a "selfie" credential, verify server-side, surface the result.
 */
export function WorldGateDemo() {
  const [verifiedAt, setVerifiedAt] = useState<string | null>(null);

  if (!isWorldConfigured) {
    return <p className="muted small">NEXT_PUBLIC_WORLD_APP_ID is not set.</p>;
  }

  const gate = requiredGate({ kind: "authorize_agent_spend", limitUsdc: 100_000_000n });

  return (
    <div className="panel">
      <p className="muted small">
        Demo action: <code>authorize_agent_spend</code> — resolves to <b>{gate.requirement}</b>.
      </p>
      <WorldVerifyButton
        action={WORLD_ACTION.authorizeAgent}
        reason={gate.reason}
        onVerified={({ uniqueness }) => setVerifiedAt(`${new Date().toLocaleTimeString()} · ${uniqueness}`)}
      />
      {verifiedAt && <p className="muted small">Last verified: {verifiedAt}</p>}
    </div>
  );
}

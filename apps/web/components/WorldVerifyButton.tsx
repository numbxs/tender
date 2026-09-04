"use client";

import { useCallback, useState } from "react";
import { IDKitRequestWidget, IDKitErrorCodes, type IDKitRequestConfig, type IDKitResult } from "@worldcoin/idkit";
import { WORLD_APP_ID, type WorldAction } from "@/lib/world";

type Phase = "idle" | "signing" | "open" | "verifying" | "done" | "error";

/**
 * IDKitRequestWidget needs *some* rp_context prop on every render — it isn't
 * conditionally mounted, only conditionally OPENED via `open`. This
 * placeholder is type-correct rather than a `null as never` escape hatch, and
 * it is never live: `open` only becomes true once the real, server-signed
 * context has replaced it.
 */
const INERT_RP_CONTEXT: IDKitRequestConfig["rp_context"] = {
  rp_id: "rp_0000000000000000",
  nonce: "0x0",
  created_at: 0,
  expires_at: 0,
  signature: "0x0",
};

const ERROR_COPY: Partial<Record<IDKitErrorCodes, string>> = {
  [IDKitErrorCodes.UserRejected]: "You declined in World App.",
  [IDKitErrorCodes.VerificationRejected]: "World App rejected the verification.",
  [IDKitErrorCodes.CredentialUnavailable]: "Your World ID doesn't have a Selfie credential yet.",
  [IDKitErrorCodes.FeatureUnavailable]: "Selfie verification isn't enabled for this app yet.",
  [IDKitErrorCodes.NullifierReplayed]: "This verification was already used.",
};

/**
 * Gates one consequential action behind a World Selfie credential. See
 * SPEC.md §6 — this component is deliberately generic over `action` rather
 * than hardcoding one, because the same flow gates several different actions
 * and the nullifier's uniqueness only holds if the action string is stable.
 *
 * Uses `IDKitRequestWidget`, not the headless `useIDKitRequest` hook. The
 * headless hook only returns state — `connectorURI`, `isAwaitingUserConnection`
 * — and expects the CALLER to render a QR code / connector link from it. An
 * earlier version of this component used the hook and never rendered that,
 * so `open()` fired and the flow genuinely started, but there was nothing on
 * screen for a phone to scan: it sat on "Waiting for World App…" forever,
 * which looked identical to a hang from the outside. The widget renders its
 * own connect UI (QR + deep link), so this failure mode isn't reachable.
 *
 * Two server round-trips, both required:
 *   1. POST /api/world/rp-context — signs a fresh RP context. Must happen
 *      per-attempt, server-side; the signing key never reaches this component.
 *   2. POST /api/verify — after World App returns a proof, our backend
 *      verifies it against World's API and checks nullifier reuse. A result
 *      IDKit hands back to the client is not itself proof of anything; only
 *      our backend's re-verification is.
 *
 * Requests the raw "selfie" credential via `constraints`, not the
 * `SelfieCheckLegacy` preset — that preset is preview-gated ("contact us if
 * you need it enabled") and v3-only. `constraints: { type: "selfie" }` is the
 * general-availability v4 path and is what World's own response schema
 * documents as a first-class credential identifier (issuer_schema_id 11).
 */
export function WorldVerifyButton({
  action,
  reason,
  onVerified,
}: {
  action: WorldAction;
  reason: string;
  onVerified: (result: { uniqueness: "first_seen" | "seen_before" }) => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [rpContext, setRpContext] = useState<IDKitRequestConfig["rp_context"] | null>(null);

  const startAttempt = useCallback(async () => {
    setError(null);
    setPhase("signing");
    try {
      const res = await fetch("/api/world/rp-context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = (await res.json()) as { rp_context?: IDKitRequestConfig["rp_context"]; error?: string };
      if (!res.ok || !body.rp_context) throw new Error(body.error ?? "Could not obtain an RP context.");
      setRpContext(body.rp_context);
      setPhase("open");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start verification.");
      setPhase("error");
    }
  }, [action]);

  const handleSuccess = useCallback(
    async (result: IDKitResult) => {
      setPhase("verifying");
      try {
        const res = await fetch("/api/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, proof: result }),
        });
        const body = (await res.json()) as { ok?: boolean; uniqueness?: "first_seen" | "seen_before"; error?: string };
        if (!res.ok || !body.ok) throw new Error(body.error ?? "Backend verification failed.");
        setPhase("done");
        onVerified({ uniqueness: body.uniqueness! });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Backend verification failed.");
        setPhase("error");
      }
    },
    [action, onVerified],
  );

  const handleError = useCallback((errorCode: IDKitErrorCodes) => {
    setError(ERROR_COPY[errorCode] ?? `Verification failed (${errorCode}).`);
    setPhase("error");
  }, []);

  if (!WORLD_APP_ID) {
    return <p className="muted small">World is not configured (NEXT_PUBLIC_WORLD_APP_ID missing).</p>;
  }

  if (phase === "done") {
    return <p className="verified">✓ Verified with World ID</p>;
  }

  return (
    <div className="world-gate">
      <p className="muted small">{reason}</p>
      {error && <p className="error small">{error}</p>}
      <button
        className="primary"
        disabled={phase === "signing" || phase === "verifying"}
        onClick={() => {
          setRpContext(null);
          void startAttempt();
        }}
      >
        {phase === "signing" && "Preparing…"}
        {phase === "verifying" && "Verifying…"}
        {(phase === "idle" || phase === "error" || phase === "open") && "Verify with World ID"}
      </button>

      {/* Mounted at all times (required prop shape), opened only once a real,
          server-signed rp_context exists — the widget itself renders the QR /
          connector UI once `open` is true. */}
      <IDKitRequestWidget
        app_id={(WORLD_APP_ID ?? "app_00000000000000000000000000000000") as `app_${string}`}
        action={action}
        rp_context={rpContext ?? INERT_RP_CONTEXT}
        allow_legacy_proofs={false}
        constraints={{ type: "selfie" }}
        open={phase === "open" && rpContext !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen && phase === "open") {
            // User closed the connector modal without completing it.
            setPhase("idle");
          }
        }}
        onSuccess={handleSuccess}
        onError={handleError}
        autoClose
      />
    </div>
  );
}

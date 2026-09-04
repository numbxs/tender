"use client";

import { useCallback, useEffect, useState } from "react";
import { useIDKitRequest, IDKitErrorCodes, type IDKitRequestConfig } from "@worldcoin/idkit";
import { WORLD_APP_ID, type WorldAction } from "@/lib/world";

type Phase = "idle" | "signing" | "ready" | "verifying" | "done" | "error";

/**
 * useIDKitRequest's config is required on every render — hooks can't be
 * called conditionally, so something has to be passed before the real,
 * server-signed rp_context exists. This placeholder is type-correct rather
 * than a `null as never` escape hatch: every field is the right TYPE (a
 * string, a number) so nothing downstream can null-dereference it, and
 * `open()` is never invoked while it's in play — gated by `phase === "ready"`
 * below, which only becomes true once the real context has replaced it.
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
  const isRealContext = rpContext !== null;

  const { open, isSuccess, isError, isAwaitingUserConnection, isAwaitingUserConfirmation, result, errorCode, reset } =
    useIDKitRequest({
      app_id: (WORLD_APP_ID ?? "app_00000000000000000000000000000000") as `app_${string}`,
      action,
      rp_context: rpContext ?? INERT_RP_CONTEXT,
      allow_legacy_proofs: false,
      constraints: { type: "selfie" },
    });

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
      setPhase("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start verification.");
      setPhase("error");
    }
  }, [action]);

  // Once rp_context lands, this render's `open()` closes over the real
  // config — fire the widget then, never while INERT_RP_CONTEXT is in play.
  useEffect(() => {
    if (phase === "ready" && isRealContext) open();
  }, [phase, isRealContext, open]);

  useEffect(() => {
    if (!isSuccess || !result || phase === "verifying" || phase === "done") return;
    setPhase("verifying");
    fetch("/api/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, proof: result }),
    })
      .then(async (res) => {
        const body = (await res.json()) as { ok?: boolean; uniqueness?: "first_seen" | "seen_before"; error?: string };
        if (!res.ok || !body.ok) throw new Error(body.error ?? "Backend verification failed.");
        setPhase("done");
        onVerified({ uniqueness: body.uniqueness! });
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Backend verification failed.");
        setPhase("error");
      });
  }, [isSuccess, result, phase, action, onVerified]);

  useEffect(() => {
    if (isError && errorCode) {
      setError(ERROR_COPY[errorCode] ?? `Verification failed (${errorCode}).`);
      setPhase("error");
    }
  }, [isError, errorCode]);

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
        disabled={phase === "signing" || phase === "verifying" || isAwaitingUserConnection || isAwaitingUserConfirmation}
        onClick={() => {
          reset();
          setRpContext(null);
          void startAttempt();
        }}
      >
        {phase === "signing" && "Preparing…"}
        {isAwaitingUserConnection && "Waiting for World App…"}
        {isAwaitingUserConfirmation && "Confirm in World App…"}
        {phase === "verifying" && "Verifying…"}
        {(phase === "idle" || phase === "error") && "Verify with World ID"}
      </button>
    </div>
  );
}

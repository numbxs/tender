import { NextResponse } from "next/server";

/**
 * Backend verification for World Selfie Check.
 *
 * Two things this route must get right, and both are easy to get wrong:
 *
 * 1. Proofs are verified server-side against the Developer Portal. A client
 *    that reports "I verified" is worth nothing.
 * 2. A valid proof is NOT sufficient. The nullifier is a per-app, per-action
 *    identifier, so the caller must check it has not been seen before —
 *    otherwise one human replays a single verification indefinitely and the
 *    uniqueness signal is worthless.
 *
 * The request is forwarded to World's endpoint "as-is" per their own
 * integration guide — IDKit constructs the correct proof shape client-side
 * (it differs between the legacy v3 Merkle-proof format and the v4
 * uniqueness-proof format that replaced it), so this route never touches the
 * proof body, only the envelope around it.
 *
 * One deliberate deviation from World's own sample code: their sample takes
 * `rp_id` from the request body. This route uses WORLD_RP_ID from server env
 * instead — an RP's identity should not be client-suppliable, even though a
 * forged rp_id can't forge a proof, defense in depth is free here.
 *
 * TODO(day 8): NULLIFIER_SEEN is process-local, so it forgets on restart and is
 * not shared across instances. Move it to the same store as agreements before
 * the demo — the reuse check is the whole point of this endpoint.
 */

const RP_ID = process.env.WORLD_RP_ID;
const VERIFY_URL = "https://developer.world.org/api/v4/verify";

/** nullifier -> first action it was seen for. */
const NULLIFIER_SEEN = new Map<string, string>();

interface VerifyBody {
  action: string;
  proof: unknown;
}

/** Success shape confirmed against docs.world.org's actual sample response — NOT `nullifier_hash`. */
interface WorldVerifySuccess {
  success: true;
  action: string;
  nullifier: string;
  created_at: string;
  environment: string;
  results: Array<{ identifier: string; success: boolean; nullifier?: string }>;
}

interface WorldVerifyError {
  success: false;
  code: string;
  detail: string;
  results?: Array<{ identifier: string; success: boolean; code?: string; detail?: string }>;
}

export async function POST(request: Request) {
  if (!RP_ID) {
    return NextResponse.json(
      { error: "World is not configured. Set WORLD_RP_ID (see .env.example)." },
      { status: 503 },
    );
  }

  let body: VerifyBody;
  try {
    body = (await request.json()) as VerifyBody;
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  if (!body.action || !body.proof) {
    return NextResponse.json({ error: "Both `action` and `proof` are required." }, { status: 400 });
  }

  const res = await fetch(`${VERIFY_URL}/${RP_ID}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // Forwarded as-is: IDKit's proof shape is not ours to construct or validate.
    body: JSON.stringify(body.proof),
  });

  if (!res.ok) {
    const upstream = (await res.json().catch(() => null)) as WorldVerifyError | null;
    return NextResponse.json(
      {
        error: "Verification failed.",
        code: upstream?.code ?? "unknown",
        detail: upstream?.detail ?? `HTTP ${res.status}`,
      },
      { status: 400 },
    );
  }

  const verified = (await res.json()) as WorldVerifySuccess;

  if (verified.action !== body.action) {
    // Should be impossible if RP_ID is ours and IDKit built the proof for this
    // action — but a mismatch here means something upstream of us is confused,
    // and treating it as verified would be the wrong failure mode.
    return NextResponse.json(
      { error: "Action mismatch.", expected: body.action, got: verified.action },
      { status: 502 },
    );
  }

  const nullifier = verified.nullifier;
  if (!nullifier) {
    return NextResponse.json({ error: "No nullifier in a successful response." }, { status: 502 });
  }

  // The uniqueness check. A verified proof whose nullifier we have already seen
  // is a repeat, not a new human.
  const seenFor = NULLIFIER_SEEN.get(nullifier);
  const isRepeat = seenFor !== undefined;
  if (!isRepeat) NULLIFIER_SEEN.set(nullifier, body.action);

  return NextResponse.json({
    ok: true,
    action: body.action,
    // Deliberately NOT returned to the client: the nullifier itself. It is a
    // stable pseudonymous identifier, and echoing it lets a caller correlate users.
    uniqueness: isRepeat ? "seen_before" : "first_seen",
  });
}

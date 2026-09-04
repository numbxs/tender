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
    body: JSON.stringify(body.proof),
  });

  if (!res.ok) {
    const detail = await res.text();
    return NextResponse.json(
      { error: "Verification failed.", detail: detail.slice(0, 400) },
      { status: 400 },
    );
  }

  const verified = (await res.json()) as { nullifier_hash?: string };
  const nullifier = verified.nullifier_hash;
  if (!nullifier) {
    return NextResponse.json({ error: "No nullifier in response." }, { status: 502 });
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
    firstSeenForAction: seenFor ?? body.action,
  });
}

import { NextResponse } from "next/server";
import { signRequest } from "@worldcoin/idkit-server";

/**
 * Signs an RP context for IDKit. This has to happen server-side and only
 * server-side: World's own integration guide is explicit that the signing key
 * must never reach the client or a leaked key lets anyone forge requests as
 * this app. WORLD_SIGNING_KEY never leaves this route.
 *
 * IDKit's `rp_context` needs `rp_id`, `nonce`, `created_at`, `expires_at`, and
 * `signature` — `signRequest()` only produces the last four (as `sig`, not
 * `signature` — the field is renamed below), so `rp_id` is added from env.
 *
 * The signature is scoped to one `action` and expires after `TTL_SECONDS`.
 * Fetch a fresh one right before opening the IDKit widget; don't cache it.
 */

const SIGNING_KEY = process.env.WORLD_SIGNING_KEY;
const RP_ID = process.env.WORLD_RP_ID;
const TTL_SECONDS = 300;

export async function POST(request: Request) {
  if (!SIGNING_KEY || !RP_ID) {
    return NextResponse.json(
      { error: "World is not configured. Set WORLD_SIGNING_KEY and WORLD_RP_ID." },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as { action?: string };
  if (!body.action) {
    return NextResponse.json({ error: "`action` is required." }, { status: 400 });
  }

  const sig = signRequest({ signingKeyHex: SIGNING_KEY, action: body.action, ttl: TTL_SECONDS });

  return NextResponse.json({
    rp_context: {
      rp_id: RP_ID,
      nonce: sig.nonce,
      created_at: sig.createdAt,
      expires_at: sig.expiresAt,
      signature: sig.sig,
    },
  });
}

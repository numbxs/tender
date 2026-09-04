# Testing Tender

Everything below is checkable right now, on real testnets, with real deployed
contracts. Nothing here is a mock — where something is still a stub (payment
settlement, mainly), it says so explicitly.

## 0. One-time setup

```bash
pnpm install
```

`.env.local` at the repo root already holds the working config — RPC URLs,
deployed addresses, your Privy/World/Hedera credentials. If you're setting up
fresh, copy `.env.example` and fill in the blanks it documents.

---

## 1. The web app — Privy, ENS identity, World Selfie Check

```bash
pnpm web
```

Opens on **http://localhost:3000**. (`pnpm web` symlinks the root `.env.local`
into `apps/web/` first — Next only reads env from its own directory, so this
step matters; see [README.md](README.md) if you ever run `next dev` directly
instead.)

**What to check:**

- **Sign in** — click "Sign in", use email or Google. Privy creates an
  embedded wallet with no seed phrase shown. You should land on the app with
  an address visible.
- **Risk policy table** — scroll down. This is `packages/shared/src/risk.ts`
  rendered live: every action in the product and whether it requires a
  selfie, a Ledger approval, both, or neither. This table *is* the World
  Selfie Check design — read [SPEC.md §6](SPEC.md) alongside it.
- **World verify demo** — further down, a panel demonstrating the
  `authorize_agent_spend` action, which the risk policy resolves to
  `selfie_and_device`. Click "Verify with World ID": this signs a fresh
  `rp_context` server-side (your signing key never reaches the browser),
  opens IDKit, and — **you'll need the World App on a phone with a Selfie
  credential to actually complete it.** Without one, you'll see the
  QR/connect flow open and then time out, which is still a useful
  check: it means the RP signing and IDKit wiring are both working, you're
  just missing the credential to finish.

**A cheaper way to prove the World integration works without a phone:**

```bash
pnpm web   # if not already running
curl -s -X POST http://localhost:3000/api/verify \
  -H 'Content-Type: application/json' \
  -d '{"action":"authorize-agent","proof":{"bogus":"proof"}}' | python3 -m json.tool
```

You should get back a **real rejection from World's own v4 API** (something
like `"action is required for uniqueness proofs"` or a proof-format error) —
not a local crash. That confirms your `WORLD_RP_ID` resolves to a real
registered app and the request is actually reaching `developer.world.org`.

---

## 2. Contracts — Foundry tests + live Arc testnet

**Local tests** (no network needed):

```bash
pnpm contracts:test
```

14 tests, covering the full escrow lifecycle, the Ledger-style
propose/approve split (an agent can never approve its own proposal — there's
a test asserting exactly that), and attestor rotation without invalidating
past attestations.

**Confirm the live deployment on Arc testnet** — these are real contracts,
already deployed, already exercised:

```bash
set -a; . .env.local; set +a

# AgreementRegistry
cast call $ARC_REGISTRY_ADDRESS 'owner()(address)' --rpc-url $ARC_RPC_URL
cast call $ARC_REGISTRY_ADDRESS 'attestor()(address)' --rpc-url $ARC_RPC_URL

# WorkEscrow — points at the registry above
cast call $ARC_ESCROW_ADDRESS 'registry()(address)' --rpc-url $ARC_RPC_URL
```

Both should return your deployer address
(`0xBB077b590B904c47DA7c76D41641Bbc8f7a9e9e7`). Full transaction history —
including a proven end-to-end lifecycle and a proven attestor rotation — is
in
[`packages/contracts/deployments/arc-testnet.json`](packages/contracts/deployments/arc-testnet.json).
Every tx hash there is a real, minable transaction: paste any of them into
[ArcScan Testnet](https://explorer.testnet.arc.network).

**Worth knowing before you touch the contracts:** on Arc, USDC *is* the
native gas token (verified against the live RPC on day 0 — see SPEC.md
§11). `WorkEscrow` settles in native `msg.value`, not an ERC-20 transfer.
There is no `approve()` step.

---

## 3. ENS — `tender.eth` and `alice.tender.eth`, live on Sepolia

Both names are already registered and resolvable. Check them without
spending anything:

```bash
set -a; . .env.local; set +a
R=$SEPOLIA_RPC_URL

# tender.eth is owned by the deployer
cast call 0xa88553f454b77203b0d036a05c894d555eaaa2cc 'isAvailable(string)(bool)' 'tender' --rpc-url $R
# -> false (we own it)

# alice.tender.eth's records, read straight off the resolver
TENDER_RESOLVER=0xbc5a8f370122Ce4Bb39eB97254CaB8Eb7fef5eC9
ALICE_NODE=0xff2c528a1041080ca90045782c274f38702aecd7e6b692070ffddfd7214c7645
cast call $TENDER_RESOLVER 'text(bytes32,string)(string)' $ALICE_NODE 'tender.payout-chain' --rpc-url $R
cast call $TENDER_RESOLVER 'text(bytes32,string)(string)' $ALICE_NODE 'tender.assurance' --rpc-url $R
```

Expected: `eip155:5042002` and `none`. Full provenance — every contract
address, why `PermissionedResolverImpl` was used instead of the
tempting-but-wrong `PublicResolverV2`, and a real incident writeup from a bug
this surfaced — is in
[`deployments/ens-sepolia.json`](deployments/ens-sepolia.json).

**To register another name or mint another subname yourself:**

```bash
pnpm ens:register            # registers a new *.eth parent (costs Sepolia USDC)
pnpm ens:setup                # mints alice.tender.eth again / a fresh demo name
```

Both scripts check availability and your balance before spending anything,
and print the faucet URL if you're short.

---

## 4. The x402 bid gateway + agent — paid bidding, end to end

Two terminals.

**Terminal 1:**

```bash
pnpm gateway
```

Listens on `http://localhost:8787`.

**Terminal 2:**

```bash
curl -s http://localhost:8787/health
curl -s http://localhost:8787/bids/quote

# No payment -> 402, with the real Hedera testnet payment requirements
curl -i -X POST http://localhost:8787/bids \
  -H 'Content-Type: application/json' \
  -d '{"jobId":"job-1","agent":"scout.alice.tender.eth","principal":"alice.tender.eth","amountUsdc":"250.00","message":"hi","assurance":"selfie"}'

# With a payment header -> 201
curl -s -X POST http://localhost:8787/bids \
  -H 'Content-Type: application/json' -H 'X-PAYMENT: demo-ref' \
  -d '{"jobId":"job-1","agent":"scout.alice.tender.eth","principal":"alice.tender.eth","amountUsdc":"250.00","message":"hi","assurance":"selfie"}' \
  | python3 -m json.tool
```

The 402 challenge is real: `network` is the canonical Hedera testnet CAIP-2
id (`hedera:testnet` — confirmed against `@x402/hedera`'s own constants, not
guessed), and `asset` is the real Hedera testnet USDC token id
(`0.0.429274`). **What's still a stub:** actual settlement verification —
`verifyPayment` in `services/gateway/src/x402.ts` currently accepts any
non-empty `X-PAYMENT` header rather than checking a real facilitator. That's
flagged inline with a `TODO(day 7)` and is the next piece of Lane C.

Full spec: [`services/gateway/openapi.yaml`](services/gateway/openapi.yaml).

**Run the agent against it:**

```bash
pnpm agent job-42
```

Fetches the quote, submits a bid, prints the accepted response. It's a real
HTTP client exercising the real 402/retry loop — only the payment settlement
inside it is stubbed, same caveat as above.

---

## 5. What each testnet is actually for

| Chain | Role | What lives there |
|---|---|---|
| **Arc testnet** (5042002) | Settlement | `WorkEscrow`, `AgreementRegistry` |
| **Sepolia** (11155111) | Identity | `tender.eth`, `alice.tender.eth`, ENSv2 registry/resolver |
| **Hedera testnet** (296) | Metering | x402 bid payments (once settlement is wired for real) |

---

## 6. If something's red

- `pnpm typecheck` and `pnpm contracts:test` should both be clean on `main`
  at all times — that's the CI gate. If either is red, something's actually
  broken; it isn't a flaky test.
- Port already in use: `lsof -ti:3000 | xargs kill -9` (swap the port for
  `8787` if it's the gateway).
- Web app shows a "Setup incomplete" notice: check `.env.local` has
  `NEXT_PUBLIC_PRIVY_APP_ID` and `NEXT_PUBLIC_WORLD_APP_ID` set, then rerun
  `pnpm web` (not `next dev` directly — see §1).

---

## 7. Bazantic — the registered gateway

`services/gateway` is registered with Bazantic as **Tender Bid Gateway**
(`slug: tnuzmuaxhrfddiyielaehvtmti`), status `draft`. Full details, including
a known gap that needs fixing before submission, are in
[`deployments/bazantic-gateway.json`](deployments/bazantic-gateway.json).

**To check it yourself:**

```bash
export BAZ=.tools/bin/baz
$BAZ whoami --json
$BAZ gateway list --json
```

**The one thing to know:** the registered endpoint is a free-tier ngrok
tunnel to a local `services/gateway` process. It only answers while that
tunnel is running, and ngrok issues a **new** URL every time it restarts —
there's no `baz gateway update`, so a restarted tunnel silently breaks the
registration until it's redone. Before the real submission this needs a
persistent deployment (Fly.io, Render, a VPS) — not another tunnel.

To reproduce the registration flow yourself:

```bash
cd .tools/bazantic-cli && pnpm install    # installs the baz CLI, isolated from the main workspace
cd ../..
.tools/bin/baz login                       # opens a device-approval URL — approve in your browser

pnpm gateway                               # in one terminal
ngrok http 8787                            # in another — note the https URL it prints

.tools/bin/baz gateway add \
  --spec-url https://raw.githubusercontent.com/numbxs/tender/main/services/gateway/openapi.yaml \
  --endpoint <the ngrok https URL> \
  --name "Tender Bid Gateway" \
  --auth-type x402-mpp \
  --status draft \
  --json
```

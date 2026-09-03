# Roadmap

Twelve days, three builders, tiered so a slip costs the cheap tracks and never the demo.
Tier definitions and prize amounts live in [SPEC.md §9](./SPEC.md).

Tick items as they land. **Push something every day** — sponsors judge git history.

---

## Day 0 — scaffold ✅

- [x] pnpm workspace, TypeScript base config, CI
- [x] `packages/shared` — domain types, risk policy, chain config
- [x] `packages/contracts` — Foundry skeleton, escrow state machine
- [x] `services/gateway` — x402-gated bid endpoint skeleton
- [x] `services/agent` — bidding agent skeleton
- [x] `apps/web` — Next.js + Privy provider

## Days 1–2 (Sep 4–5) — skeleton → identity

- [ ] **Register the Bazantic account** — username is a submission requirement, do it now
- [ ] Verify Arc testnet chain ID + USDC address, fill `.env.example`
- [ ] Privy auth end to end: email login → embedded wallet
- [ ] ENSv2 subname minting on Sepolia for a new user
- [ ] Write ENS records: payout chain, assurance level
- [ ] `feat(web): privy auth + ens subname claim`

## Days 3–6 (Sep 6–9) — the core loop

- [ ] `WorkEscrow` — fund, submit milestone, propose release, release
- [ ] Foundry tests covering the full state machine
- [ ] Deploy to Arc testnet
- [ ] Job posting + bidding UI
- [ ] Client funds a milestone in USDC, freelancer receives it
- [ ] **Draft the architecture diagram** — Arc requires one, and it forces the design
- [ ] `feat(contracts): work escrow with milestone settlement`

## Days 7–8 (Sep 10–11) — the agent layer

*This is the day the project stops being generic.*

- [ ] Gateway: x402 payment required on `POST /bids`
- [ ] Agent: pays and submits a bid on a human's behalf
- [ ] Proof-of-human attached to each bid
- [ ] Selfie Check wired to the risk gate — **not** to login (SPEC §6)
- [ ] Start the World feedback doc *while integrating*, not after
- [ ] `feat(gateway): x402-metered bid submission`

## Days 9–10 (Sep 12–13) — the trust layer

- [ ] Ledger approval on escrow release — agent proposes, human approves on device
- [ ] Chainlink Confidential Workflow: private terms → onchain attestation
- [ ] Get the CRE simulation passing early — Chainlink deploys passing sims during the event
- [ ] Hedera: tokenise a live agreement as a transferable claim
- [ ] `feat(agent): ledger-gated release proposal`

## Day 11 (Sep 14) — bolt-ons

- [ ] Uniswap API: freelancer takes payout in a non-USDC token
- [ ] `FEEDBACK.md` + Uniswap Developer Feedback Form
- [ ] Bazantic Gateway over the Tender API + one Recipe
- [ ] Bazantic screen recording

## Days 12–13 (Sep 15–16) — submission

*Do not compress this. Several artifacts are graded.*

- [ ] Demo video master cut, then trimmed per sponsor (Hedera ≤5 min)
- [ ] Finish the World feedback document
- [ ] Verify the repo for Hedera
- [ ] Final architecture diagram
- [ ] Submit — checklist in [SPEC.md §12](./SPEC.md)

---

## Commit conventions

`type(scope): summary` — `feat`, `fix`, `docs`, `chore`, `test`, `ci`.
Scopes: `web`, `contracts`, `gateway`, `agent`, `shared`.

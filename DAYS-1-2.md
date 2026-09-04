# Days 1–2 · 4–5 September

Three lanes, **no blocking dependencies between them**. Everyone codes against
`@tender/shared`, which is already committed, so nobody waits on anybody.

**Goal by end of day 2:** contracts live on Arc, a user can log in and hold an ENS
subname, and a bid can be paid for. Three things, provable, in parallel.

---

## What day 0 already settled

| Question | Answer |
|---|---|
| Arc chain ID | `5042002` — verified against the live RPC |
| Arc RPC | `https://rpc.testnet.arc.network` — live, block ~60.3M |
| Arc USDC | **The native gas token.** Precompile `0x3600…0000` answers ERC-20 *reads* |
| Escrow design | **Native value.** No `approve()`, so funding is one transaction |
| Bazantic | Registered — account active |
| Privy | Account exists |

**The one that changed the architecture:** the USDC precompile has no bytecode
selectors — calls are intercepted natively. `approve()`/`transferFrom()` cannot be
assumed to behave like a normal token. `WorkEscrow` now settles in native value and
never calls the precompile. This removes a whole class of day-4 failure, and it makes
funding one transaction instead of two, which is a Privy scoring point.

---

## Lane A — Builder A — *the money path is live on Arc*

Owns Arc and Hedera. Nothing here depends on B or C.

- [x] **A1 · Fund a deployer.** ✅ 20 USDC Get Arc testnet USDC from the faucet. On Arc, USDC is
      gas *and* value — the same balance pays for both, so fund generously.
      `cast balance $ADDR --rpc-url https://rpc.testnet.arc.network`
- [x] **A2 · Deploy.** ✅ registry `0xc6488C…5557`, escrow `0x441870…087a` `forge script script/Deploy.s.sol --rpc-url $ARC_RPC_URL --private-key $ARC_DEPLOYER_PRIVATE_KEY --broadcast`
      Put the two addresses in `.env.local` and commit them to `.env.example` as comments.
- [x] **A3 · Prove the full cycle on-chain** ✅ 6 txs, 1.000000 USDC settled, not just in Foundry: attest → create →
      fund → submit → propose → approve. Capture the tx hashes — this is demo footage.
- [x] **A4 · Verify `approve()` empirically** ✅ it works; keeping native anyway now that you have funds. Send one
      `approve` to the precompile and see whether it reverts. Record the answer in
      `SPEC §11` either way. *We do not depend on it — but we should know.*
- [x] **A5 · Hedera testnet account** ✅ funded 100 HBAR, Hashio relay live (chain 296) + confirm the JSON-RPC relay reaches it. Metering
      lands on Hedera (day 7), so having the account on day 2 removes a day-7 surprise.

**Done when:** a stranger can read the tx hashes and watch USDC move through escrow.

---

## Lane B — Builder B — *a person can log in and be somebody*

Owns Privy, ENS, World. Owns the demo, because Privy is judged on polish.

- [x] **B1 · Privy app.** ✅ app id set, Arc registered as a custom chain, login modal verified in-browser Register Arc as a custom chain — Privy will not know
      `5042002`. Chain config is in `packages/shared/src/chains.ts`; use `arc()`.
- [~] **B2 · Email login → embedded wallet.** UI verified; complete a real login to confirm wallet creation. `createOnLogin: "users-without-wallets"`.
      The target is a freelancer who never sees a seed phrase.
- [ ] **B3 · ENSv2 subname on Sepolia.** Note this is a *different chain* from the
      escrow — the app is multi-chain from day 1. Get `alice.tender.eth` minting.
- [ ] **B4 · Write ENS records:** payout chain, assurance level. Records-as-application-data
      is the ENS winning pattern; display names alone do not place.
- [x] **B5 · Replace the placeholder page** ✅ shell with auth, setup notice, live risk table with a real shell: logged-out, logged-in,
      your ENS identity. Keep the risk-policy table somewhere — it is a good demo aid.

**Done when:** someone signs in with an email and ends up holding a subname with records.

---

## Lane C — Builder C — *unknowns are de-risked before they cost a day*

Owns the integrations. Front-loads everything with an unknown vendor, because those
are what slip.

- [ ] **C1 · Bazantic first, not last.** Account exists — submit the gateway's OpenAPI
      spec and get a Gateway responding. It is a first-time sponsor with thin docs;
      find out on day 1 whether it works, not on day 11.
      **Record the username in `.env.local` — it is a submission requirement.**
- [ ] **C2 · World developer app + Sandbox access.** Get `NEXT_PUBLIC_WORLD_APP_ID`.
      Read the Selfie Check docs and confirm our reading: it returns a medium-assurance
      *signal*, not an identity.
- [ ] **C3 · Start `FEEDBACK-world.md` today.** Every rough edge, while you hit it.
      This document is graded, and it cannot be reconstructed on day 16.
- [ ] **C4 · x402 spike.** Pick the facilitator, get one real settlement working on
      Hedera testnet — even outside our code. `services/gateway/src/x402.ts` has the
      seam; only `verifyPayment` and `settle` change.
- [ ] **C5 · Write the OpenAPI spec** for the gateway. C1 needs it, and Bazantic
      consumes it directly.

**Done when:** Bazantic answers, World's app ID exists, and one real x402 payment settled.

---

## Checkpoints

Two syncs. Keep them to fifteen minutes.

**End of day 1 — one sentence each.** Not a status meeting; a blocker sweep.
The only question that matters: *is anything going to stop you tomorrow?*

**End of day 2 — the integration gate.** Three checks, run together:

1. `pnpm typecheck && pnpm contracts:test` — green on `main`
2. Escrow addresses on Arc, with a real release tx hash
3. Login → subname → a paid bid reaches the gateway

If any of the three is red at this point, **cut Tier 3 (Uniswap, Bazantic) from the
plan** rather than compressing Tier 1. The product existing beats two extra submissions.

---

## Standing rules

- **Commit and push daily.** Several sponsors judge git history; 1inch and Uniswap say
  so explicitly. Small commits with real messages, every day, all twelve.
- **Keep `main` green.** `pnpm typecheck` must pass before merge.
- **Write feedback docs while integrating**, never afterwards. World and Uniswap both
  grade them, and they are the cheapest points on the board.
- **Nobody touches another lane's files on days 1–2.** If you need something from
  another lane, stub it behind a type from `@tender/shared` and move on.

# Tender

An agent-mediated work marketplace with an anti-Sybil economy.
Built for [ETHOnline 2026](https://ethglobal.com/events/ethonline2026) · 4–16 September.

> Job marketplaces are drowning in AI-generated applications. Tender makes every bid cost a
> fraction of a cent and carry proof that a real human stands behind it — then settles the work
> onchain without either party publishing their terms.

**[SPEC.md](./SPEC.md)** — the mechanism, sponsor map, architecture, and build order.
**[ROADMAP.md](./ROADMAP.md)** — the day-by-day commit plan.

## Quickstart

```bash
pnpm install
cp .env.example .env.local     # fill in as you go; nothing is required to boot the UI
pnpm web                       # http://localhost:3000
```

`pnpm web` symlinks `apps/web/.env.local` to the root `.env.local` first. Next only
reads env from its own project directory, so without that link every `NEXT_PUBLIC_*`
var is silently ignored — including the Privy app id. Run `pnpm setup:env` if you
start Next some other way.

Contracts (needs [Foundry](https://getfoundry.sh)):

```bash
pnpm contracts:build
pnpm contracts:test
```

## Layout

| Path | What | Owner |
|---|---|---|
| `packages/shared` | Domain types, risk policy, chain config | shared |
| `packages/contracts` | Foundry — `WorkEscrow`, `AgreementRegistry` | Builder A |
| `apps/web` | Next.js — Privy, ENS, Selfie Check, UI | Builder B |
| `services/gateway` | x402-gated bid endpoint (Hono) | Builder C |
| `services/agent` | Bidding agent, x402 client | Builder C |

## Working agreement

**Commit daily and push.** Several sponsors — 1inch and Uniswap explicitly — judge git history,
and a single end-of-hackathon dump reads as a red flag. Small commits, real messages, all
twelve days.

Branch per feature, squash-merge to `main`. Keep `main` green: `pnpm typecheck` must pass.

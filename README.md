# IPRN SMS Traffic Panel

A professional, self-hosted **IPRN / Premium-rate SMS traffic panel** — a multi-role reseller layer on top of your account on a wholesale SMS platform (e.g. `sms.carefulsupport.com`).

It mirrors the supplier-side model of the upstream marketplace: the platform binds into this panel's SMPP gateway and delivers **P2P / A2P inbound traffic** to your premium DIDs; every message is priced, ledgered and split — users earn their published rate, and the operator keeps a **hidden margin** (default 30 %) that is never exposed to non-admin roles.

## Roles

| Role | Sees | Can |
|---|---|---|
| **ADMIN** | everything incl. true rates, margin kept, agent commissions, raw events | manage users/agents, numbers, true rates, payouts, upstream integration, audit |
| **AGENT** | their sub-users' traffic and earnings (derived rates only) + own commission | create sub-users, request payouts |
| **USER** | own numbers, traffic, derived rates, wallet | rent numbers, view/export/delete traffic, request payouts, receive pushes (HTTP webhook or SMPP bind) |

The rate engine: `user_earning = true_rate × (1 − margin %)` per message. True rates, margins and admin commissions appear **only** on admin surfaces (pages, tables, exports and REST API).

## Upstream integration

- **SMPP supplier connector** (built in, port 2775): register it on the platform under *Outbound Connectors* with `adapter=generic-smpp34`, your host, port 2775, the `UPSTREAM_SMPP_SYSTEM_ID/PASSWORD` — the platform binds from `35.224.28.251` (allowlist it). Incoming `submit_sm` traffic is ingested, priced, split and **auto-DLR'd** (protecting the upstream 24-hour DLR rule).
- **Vendor-copy MO webhook** (HTTP): one click in *Settings → Upstream* calls `PUT /v1/account/mo-webhook` on the platform with your panel's secret URL; copies are de-duplicated and `simulated: true` test traffic is zero-rated.
- **HTTP PUSH** receiver with basic auth for platform HTTP MO pushes.
- Platform rules mirrored: 7-day no-inbound number expiry (with countdown badges), weekly factoring payout schedule (fee %) vs monthly full rate, minimum payout threshold.

## Environment

See [`.env.example`](.env.example). Key variables: `DATABASE_URL` (SQLite path), `SESSION_SECRET`, `ADMIN_EMAIL/ADMIN_PASSWORD` (bootstrap), `SEED_DEMO`, `SMPP_PORT`, `UPSTREAM_SMPP_SYSTEM_ID/PASSWORD`, `UPSTREAM_BASE_URL`, `UPSTREAM_API_KEY`, `PUBLIC_URL`, `MO_WEBHOOK_SECRET`.

## Deploy (Docker / Coolify)

1. Point DNS at the server, create the app from this repo, set the environment variables.
2. Persistent volume on `/app/db` (SQLite lives there; a schema template seeds itself on first boot — admin + 99 real settlement rate groups).
3. Expose ports `3000` (web) and `2775` (SMPP) — allowlist `35.224.28.251` in any firewall.
4. First boot creates the admin from `ADMIN_EMAIL/ADMIN_PASSWORD`; sign in and open **Setup Guide** for the platform-side steps.

## REST API (panel users)

`x-api-key: usr_…` header (per-user key from *Settings → My channel*):

- `GET /api/v1/me` · `GET /api/v1/numbers?available=1` · `GET /api/v1/messages?since=&class=&limit=`
- `GET /api/v1/rates` (derived rates only) · `GET /api/v1/balance`
- `POST /api/v1/payouts { "amount": 250, "method": "IBAN …" }`

Admin keys additionally return `true_value` / `margin_kept` / `billing_status` on messages.

## Stack

Next.js 16 (App Router, standalone) · TypeScript · Tailwind CSS 4 + shadcn/ui · Prisma + SQLite · jose JWT sessions · node-smpp gateway · recharts.

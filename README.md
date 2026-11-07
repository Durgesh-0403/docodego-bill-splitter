# Shared Bill Splitter

## Overview
A shared household bill splitting application.
Users can create homes, add members,
split bills and track unpaid balances.

## Tech Stack
- React
- TypeScript
- Vite
- TanStack Router
- Hono
- Cloudflare Workers
- Cloudflare D1 (SQLite)

## Architecture
Frontend communicates with the Hono API.
The API handles business logic and stores
home, member, bill and payment information
in Cloudflare D1.

## Setup

pnpm install
pnpm dev

## Testing

pnpm test
pnpm typecheck
pnpm check
pnpm build

## Decisions

1. Integer-based money:
   I used integer cents instead of decimals
   to avoid floating-point calculation issues.

2. Idempotent payments:
   I used idempotency keys to prevent
   duplicate payment processing.

3. Database constraints and transactions:
   I used database constraints and atomic
   operations to protect data consistency.
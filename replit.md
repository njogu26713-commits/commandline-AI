# CodeVault

An AI-powered software development platform where users can create, manage, deploy, and monetize projects. Clean, professional white UI (GitHub/Linear/Vercel aesthetic) with full light/dark mode.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/codevault run dev` — run the frontend (port 21609)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, TailwindCSS, Wouter, Recharts, Framer Motion, next-themes, shadcn/ui
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — OpenAPI contract (source of truth)
- `lib/api-client-react/src/generated/` — generated React Query hooks
- `lib/api-zod/src/generated/` — generated Zod schemas
- `lib/db/src/schema/` — Drizzle ORM table definitions
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/codevault/src/` — React frontend

## Architecture decisions

- `lib/api-zod/src/index.ts` exports only `./generated/api` (NOT `./generated/types`) to avoid TS2308 name collisions when Orval generates both Zod schemas and TypeScript interfaces with the same `Params` names
- `orval.config.ts` does NOT set `schemas` for the `zod` output to prevent the types/ directory being regenerated (which caused the collision)
- Query parameters removed from list endpoints to prevent `<OperationIdPascal>Params` naming collision in barrel exports; client-side filtering is used instead
- Mock data used for file explorer, commits, and branches (repository management); all other data is real DB-backed
- AI chat returns rotating mock responses (no LLM integration wired yet)

## Product

- Dashboard with live stats, revenue chart, AI usage chart, activity feed, deployment status
- Projects: list/create/delete projects with language badges, stars, forks
- Project Detail: tabbed view with file explorer, commit history, branches, issues
- AI Builder: chat interface with session history and code block rendering
- Deployments: table of all deployments with Railway/Vercel/Netlify, logs modal
- Marketplace: grid of templates, bots, AI tools with prices, ratings, download counts
- Trading Signals: dedicated bot dashboard with signals, win rate chart, subscribers, performance
- User Profile: contribution graph, achievement badges, project list
- Settings: comprehensive static settings page

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- After any OpenAPI spec change, re-run `pnpm --filter @workspace/api-spec run codegen` before building
- Do NOT add `schemas: { path: "generated/types", ... }` back to the `zod` section of `orval.config.ts` — this causes TS2308 barrel re-export collisions
- Do NOT add `export * from "./generated/types"` back to `lib/api-zod/src/index.ts`
- Avoid query parameters on endpoints (use path params only); they generate `Params` types that conflict

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details

---
name: Orval Params collision fix
description: How to prevent TS2308 barrel re-export collisions when using Orval with both Zod and TypeScript schema output
---

## The Rule

When using Orval with `client: "zod"`, do NOT set `schemas: { path: "generated/types", type: "typescript" }` in the output config. And do NOT `export * from "./generated/types"` in the `lib/api-zod/src/index.ts` barrel.

**Why:** Orval generates `<OperationIdPascal>Params` Zod schemas in `generated/api.ts` AND TypeScript interfaces in `generated/types/<operationId>Params.ts`. When the barrel re-exports both with `export *`, TypeScript throws TS2308 ("Module has already exported a member named X"). This occurs for any endpoint with query parameters.

**How to apply:** Every time the Orval config is touched, ensure:
1. `lib/api-spec/orval.config.ts` zod section has NO `schemas` key
2. `lib/api-zod/src/index.ts` contains only `export * from "./generated/api";` (not the types line)

Note: Orval regenerates `lib/api-zod/src/index.ts` on each codegen run. If the `schemas` key is present in config, Orval regenerates the barrel WITH the types line, overwriting any manual fix. The config is the root cause — fix it there.

Also: avoid query parameters on list/filter endpoints. Use path params only. Query params on operations generate `<OperationIdPascal>Params` that collide. Filter client-side instead.

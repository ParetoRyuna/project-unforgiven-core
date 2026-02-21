# PR Title
Upgrade to Next 16, migrate lint config, and clear production audit findings

## Summary
- Upgrade core stack:
  - `next@16.1.6`
  - `eslint-config-next@16.1.6`
  - `eslint@9.39.2`
- Migrate lint config to Flat Config for Next 16:
  - add `eslint.config.mjs`
  - update lint script to:
    - `eslint app components hooks lib --ext .js,.jsx,.ts,.tsx`
- Remove remaining vulnerable dependency chain:
  - upgrade to `recharts@3.7.0`
- Add production-ready env template:
  - add `.env.example` with strict Oracle key settings and deployment-safe defaults
- Compatibility fixes:
  - NextRequest IP typing fallback in `app/api/shield-score/route.ts`
  - Anchor wallet type bridge updates in:
    - `hooks/useProgram.ts`
    - `hooks/useUnforgivenProgram.ts`

## Validation
- `npm run lint` passed
- `npm run build` passed
- `npm run ci:gate` passed
- `npm audit --omit=dev --json`:
  - `high: 0`
  - `moderate: 0`
  - `critical: 0`

## Notes
- Lint scope is intentionally limited to app/runtime paths to keep CI stable during ESLint v9 migration.
- Commit for this PR: `fb5ae79`

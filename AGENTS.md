# Handy Dandy Source Agent Instructions

## Scope
- Applies to this repository only.
- This repo is the original monolithic `handy-dandy` module and now serves as the reference/compatibility source while the split repos mature.

## Split Targets
- Shared runtime and toolbar shell: `handy-dandy-core`
- OpenRouter and AI generation flows: `handy-dandy-conjur`
- Rune Stripper, Map Notes, and other utility tools: `handy-dandy-tools`

## Product Intent
- Handy Dandy remains PF2E-focused and OpenRouter-first.
- Preserve reliability and recovery behavior when generation/import fails.
- Preserve `game.handyDandy.*` compatibility in the monolith unless explicitly changing that contract.

## Working Rules
- Prefer implementing new shared/runtime work in Core, AI work in Conjur, and utility work in Tools.
- Change this repo when maintaining monolith compatibility or extracting behavior into the split repos.
- If a behavior changes during extraction, preserve runtime behavior first and refactor second.

## Architecture
- Entry and lifecycle hooks: `src/scripts/module.ts`
- OpenRouter runtime: `src/scripts/openrouter/*`
- Shared generation pipeline: `src/scripts/generation/*`
- PF2E mapping and validation: `src/scripts/mappers/*`, `src/scripts/validation/*`, `src/scripts/schemas/index.ts`
- Utility features: `src/scripts/map-markers/*`, `src/scripts/flows/rune-stripper.ts`

## Build and Verification
- `npm ci`
- `npx tsc --noEmit`
- `npm run build`
- `npm run deploy:local`

## Cross-Repo Reference
- For PF2E-specific behavior, consult `e:\\repos\\pf2e` before changing data contracts.
- Keep README/docs in sync when a split or extraction changes where a feature now belongs.

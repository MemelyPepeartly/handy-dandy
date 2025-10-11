# Development Guide

This guide outlines how to add new entity schemas and connect them to the Handy Dandy generation and import flows. It also covers how to extend the normalisation helpers and manage schema version bumps with migrations.

## Adding a new entity schema

1. **Define the schema type.** Add the TypeScript interface and JSON schema definition in [`src/scripts/schemas/index.ts`](../src/scripts/schemas/index.ts). Register the entity in the shared constants (e.g. `ENTITY_TYPES`), add it to the `schemas` map, and compile a validator in the `validators` map so `ensureValid` can look it up.【F:src/scripts/schemas/index.ts†L25-L127】【F:src/scripts/schemas/index.ts†L188-L217】
2. **Expose prompt inputs.** Create a prompt builder (and input type) under [`src/scripts/prompts`](../src/scripts/prompts) and export it from the module index so the generator can use it alongside the existing helpers.【F:src/scripts/prompts/index.ts†L1-L18】
3. **Add a generator.** Follow the pattern in [`src/scripts/generation/index.ts`](../src/scripts/generation/index.ts) to call your prompt builder, request a draft from the GPT client, and pass the result through `ensureValid`. Export the function so UI and developer helpers can reach it.【F:src/scripts/generation/index.ts†L1-L86】
4. **Wire batch flows.** Extend the generator/importer maps in [`src/scripts/flows/batch.ts`](../src/scripts/flows/batch.ts) so batch generation can call your new generator and importer. Update `CanonicalEntityMap`, `PromptInputMap`, and `GenerationBatchOptions` to include the new entity type.【F:src/scripts/flows/batch.ts†L1-L120】【F:src/scripts/flows/batch.ts†L153-L206】
5. **Implement import/export mappers.** Add conversion helpers in [`src/scripts/mappers`](../src/scripts/mappers) for the new entity. Generation relies on the importer to create Foundry documents, and export uses the reverse mapping for batch UI previews.【F:src/scripts/mappers/import.ts†L1-L118】
6. **Update developer helpers and UI.** Ensure [`src/scripts/module.ts`](../src/scripts/module.ts) and [`src/scripts/dev/tools.ts`](../src/scripts/dev/tools.ts) expose the generator so testers can call it from the console or developer namespace.【F:src/scripts/module.ts†L69-L134】【F:src/scripts/dev/tools.ts†L1-L112】

## Extending normalisation maps

The validation layer performs light coercion before running AJV. Update the lookup tables in [`src/scripts/validation/ensure-valid.ts`](../src/scripts/validation/ensure-valid.ts) when introducing new enum values or aliases so loosely formatted payloads can be repaired automatically (e.g. the action type and rarity maps). Add a branch to `normalizePayload` for new entity types and supply field-specific coercion helpers as needed.【F:src/scripts/validation/ensure-valid.ts†L52-L198】【F:src/scripts/validation/ensure-valid.ts†L210-L331】

## Schema version bumps and migrations

1. **Raise the version.** Bump `LATEST_SCHEMA_VERSION` in [`src/scripts/schemas/index.ts`](../src/scripts/schemas/index.ts) and update any schema enums or defaults that changed.【F:src/scripts/schemas/index.ts†L39-L130】
2. **Add migration steps.** Register forward-only migrations in [`src/scripts/migrations/index.ts`](../src/scripts/migrations/index.ts) for each validator key. Each entry maps the previous version to a function that mutates the payload into the next version before bumping the `schema_version`.【F:src/scripts/migrations/index.ts†L1-L63】
3. **Keep pack indices current.** Remember to include `packEntry` migrations when the structure of stored compendium metadata changes so the batch importer/exporter can still round-trip entries.【F:src/scripts/migrations/index.ts†L8-L31】

After these steps, regenerate TypeScript output if required and add tests or fixtures that cover the new entity type or migration behaviour.

# Handy Dandy Agent Instructions

## Scope
- Applies to all work under `e:\repos\handy-dandy`.
- This file is the repo-local operating contract for agents working on Handy Dandy.

## Product Intent (Non-Negotiable)
- Handy Dandy is a PF2E-focused Foundry VTT module with OpenRouter-first generation workflows.
- User-facing language and behavior must be OpenRouter-oriented, not GPT-branded.
- Prioritize reliability and cost safety: never silently lose generated output if import/application fails.
- Preserve PF2E system correctness over creative freedom when there is a conflict.

## Core Architecture
- Entry and lifecycle hooks: `src/scripts/module.ts`.
- Settings and account/model management:
- `src/scripts/setup/settings.ts`
- `src/scripts/setup/openrouter-account.ts`
- `src/scripts/setup/openrouter-model-manager.ts`
- OpenRouter runtime and API integration:
- `src/scripts/openrouter/client.ts`
- `src/scripts/openrouter/runtime.ts`
- `src/scripts/openrouter/model-catalog.ts`
- Shared generation pipeline:
- `src/scripts/generation/pipeline.ts`
- Prompt and remix flows:
- `src/scripts/flows/prompt-workbench.ts`
- `src/scripts/flows/prompt-workbench-ui.ts`
- `src/scripts/flows/npc-section-remix.ts`
- `src/scripts/flows/item-remix.ts`
- `src/scripts/flows/rule-element-generator.ts`
- Validation and schema pipeline:
- `src/scripts/validation/ensure-valid.ts`
- `src/scripts/schemas/index.ts`
- `src/scripts/migrations/index.ts`
- Mapping and import/export:
- `src/scripts/mappers/import.ts`
- `src/scripts/mappers/export.ts`
- UI templates/styles:
- `src/templates/*.hbs`
- `src/styles/*.css`

## OpenRouter Policy
- Treat OpenRouter as the sole AI backend unless the user explicitly requests otherwise.
- Keep per-user auth and model selection behavior intact (user-scoped settings).
- Keep OpenRouter web search enabled by default unless user asks to disable it.
- Validate model capabilities before generation (structured output/tool support for text; image support for image generation).
- Favor dynamic catalog-driven model choices (via OpenRouter model catalog) over hardcoded static lists.
- Prefer OpenRouter models that explicitly advertise structured outputs (`structured_outputs` or `response_format`) for text generation.
- When an API key is present, prefer user-scoped OpenRouter model catalogs over global catalogs when refreshing model choices.

## Shared Generation Pipeline (Required)
- All structured-output generation should go through the shared pipeline in `src/scripts/generation/pipeline.ts`.
- Use:
- `generateStructuredOutput(...)` for non-entity schema-bound generation (for example rule elements, box text, scoped text rewrites).
- `normalizeGeneratedEntity(...)` for deterministic post-generation normalization of existing/generated payloads.
- `mapCanonicalActor(...)` for canonical actor -> Foundry actor source conversion.
- For actor/item/action generation progress, prefer the explicit pattern:
- `generateStructuredOutput(...)` -> `normalizeGeneratedEntity(...)` -> (optional mapping/import transforms).
- Treat `src/scripts/generation/index.ts` as the central orchestration layer for actor/item/action generation.
- Keep schema transport and normalization in `pipeline.ts`, and keep progress/routing/image/mapping orchestration in `generation/index.ts`.
- Do not call `openRouterClient.generateWithSchema(...)` directly from flows or UI code when the shared pipeline can be used instead.
- Do not call `toFoundryActorDataWithCompendium(...)` directly from flows when `mapCanonicalActor(...)` covers the use case.
- Keep prompt construction flow-specific, but keep transport/schema invocation/normalization centralized.
- If structured-output behavior changes, update the pipeline first and migrate call sites toward it rather than patching individual tools separately.
- Do not reintroduce isolated per-feature generator stacks that duplicate model routing, schema invocation, or normalization logic.

## Generation Progress + Routing Contract (Required)
- Progress events are part of UX contract and must reflect real execution order.
- Keep generation step order aligned to runtime behavior:
- `prompt` -> `model` -> `routing` -> `generation` -> `validation` -> optional `image` -> optional `mapping` -> `done`.
- Never emit `validation` before model generation has completed.
- Never emit `generation` before a provider route has been selected.
- OpenRouter routing fallback events should flow through `GenerateWithSchemaOptions` callbacks:
- `onRoutingRetry` when fallback attempts occur.
- `onRoutingResolved` when a concrete route/attempt is selected for generation.
- If routing/retry semantics change in `src/scripts/openrouter/client.ts`, update progress messaging in:
- `src/scripts/generation/index.ts`
- `src/scripts/flows/prompt-workbench-ui.ts`
- and tests in:
- `tests/generation.test.ts`
- `tests/openrouter-client.test.ts`

## Loading UI Stream Contract
- Prompt Workbench loading UI must include both:
- high-level step progression
- expandable live progress stream (timestamped step/message log)
- Loading stream UI lives in:
- template: `src/templates/prompt-workbench-loading.hbs`
- logic: `src/scripts/flows/prompt-workbench-ui.ts`
- styles: `src/styles/prompt-workbench.css`
- If adding/removing progress step keys, update all three layers plus affected tests in the same change.

## Generation and Import Safety Rules
- Always surface useful failure messages when generation or import fails.
- If generation succeeded but import/apply failed, present recovery UI with copy/download JSON:
- `src/scripts/ui/generated-output-recovery.ts`
- Never discard generated payloads on failure paths.
- Preserve document identity semantics:
- Prompt Workbench actor imports should create new actors (`createNew: true`) unless user explicitly requests overwrite behavior.
- Item remix on an existing sheet must target the same item and keep the same effective Foundry/PF2E item type.
- Do not mutate item type during in-place updates unless explicitly requested and implemented safely.

## Remix Behavior Contract
- Centralize remix UX to avoid duplicate/conflicting remix buttons and overlapping flows.
- Prefer a single primary remix entrypoint per sheet context (avoid multiple competing remix actions in the same sheet header/sidebar).
- Section remix must be section-scoped:
- For add operations, generate and import only the requested section payload.
- For replace operations, replace only selected sections.
- Do not regenerate and re-import an entire actor when only one section is requested.
- Preserve unselected actor sections and existing user edits.
- For canonical PF2E content, prefer compendium-backed resolution rather than fabricated generated replacements.

## PF2E Data Correctness Rules
- PF2E-specific behavior must align with PF2E system expectations for actor/item source structure.
- Keep inline rich text syntax PF2E-valid when generating or repairing text:
- `@UUID[...]{}`
- `@Check[...]`
- `@Damage[...]`
- `@Template[...]`
- Ensure format-fix/remix tools normalize malformed inline syntax and broken UUID references where possible.
- Rule Element generation must emit PF2E-valid JSON structures (including toggleable and non-toggleable cases).

## UI, Templates, and Styling Standards
- Do not build new large HTML blobs inside TypeScript for complex UIs.
- Prefer Handlebars templates for dialogs/panels:
- `src/templates/*.hbs`
- Keep CSS in stylesheet files:
- `src/styles/*.css`
- Avoid large inline style blocks in TS and HBS unless trivial.
- Prevent duplicate control/button insertion on repeated render hooks.
- Keep GM-gated controls behind `game.user?.isGM` where appropriate.

## Public Namespace and API Stability
- Preserve `game.handyDandy` namespace behavior unless task explicitly changes public API.
- Keep generation helpers and flow entry points stable:
- `game.handyDandy.generation.*`
- `game.handyDandy.flows.*`
- If contract changes are required, update call sites, typings, and README/docs in the same change.

## PF2E Cross-Repository Reference (Required)
- For PF2E-specific implementation questions, consult `e:\repos\pf2e` before changing Handy Dandy logic.
- Primary PF2E references:
- `e:\repos\pf2e\system.pf2e.json`
- `e:\repos\pf2e\src\module\`
- `e:\repos\pf2e\src\scripts\`
- `e:\repos\pf2e\packs\pf2e\`
- Do not edit `e:\repos\pf2e` unless user explicitly requests cross-repo edits.

## Build, Test, and Verification
- Install deps: `npm ci`
- Validation tests: `npm run test:validation`
- Type check: `npx tsc --noEmit`
- If PowerShell blocks execution policy, use: `cmd /c npx tsc --noEmit`
- Production build: `npm run build`
- Deployment copy build: `npm run test` (build + copy to local Foundry modules dir)
- Minimum expectations:
- `schemas`, `validation`, `mappers`, `flows`, `generation`, `openrouter`: run validation tests + type check.
- `module.ts`, `setup/*`, `ui/*`, `templates`, `styles`: run build and provide manual verification notes.

## Manual QA Expectations for Feature Work
- Verify OpenRouter auth and model selection flows in both browser Foundry and desktop Foundry where applicable.
- Verify generation failure paths show clear notifications and recovery dialog.
- Verify remix operations do not unintentionally replace unrelated actor/item data.
- Verify item/NPC sheet buttons render once and in intended locations.
- Verify PF2E compendium resolution behavior for canonical items/spells/actions.

## Working Constraints
- Keep edits focused and minimal; avoid unnecessary refactors.
- Reuse existing utilities/patterns before adding new abstractions.
- Before adding a new generation/remix helper, check whether `src/scripts/generation/pipeline.ts`, `src/scripts/generation/index.ts`, or existing import/export utilities already cover the need.
- Do not hand-edit generated files in `dist/`.
- Treat `src/static/module.json` as template input; manifest metadata is derived from `package.json`.
- If schema behavior changes, update migrations/validation/tests together.

## Versioning and Releases
- Bump module version only when explicitly requested.
- If version bump is requested, keep `package.json` and `package-lock.json` synchronized.

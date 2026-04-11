# Handy Dandy

Handy Dandy is the original monolithic source module for the Handy Dandy Foundry VTT toolset.
It still contains the full feature surface, but the codebase is now being split into dedicated repos:

- `handy-dandy-core`: shared runtime and toolbar shell
- `handy-dandy-conjur`: OpenRouter and AI generation features
- `handy-dandy-tools`: non-AI utility tools such as Rune Stripper and Map Notes

This repo remains the compatibility/reference source while that split is completed.
New feature work should usually land in the split repos instead of expanding this monolith.

## Current Feature Surface

- **Prompt Workbench**: Generate PF2e action, item, and actor JSON with import-ready workflows.
- **Map Notes controls**: Drop and manage map markers directly from scene controls.
- **OpenRouter integration**: Connect each user account with OpenRouter OAuth, then use that account for generation and image workflows.

Prompt Workbench is available from the *Handy Dandy Tools* control group in scene controls (GM only).

## Installation

Pre-built releases are available on the project page. To install manually, copy the contents of `dist/` to:

`FoundryVTT/Data/modules/handy-dandy/`

To build locally:

```bash
npm ci
npx tsc --noEmit
npm run build
```

The build writes compiled files to `dist/` and transforms `src/static/module.json` with package metadata.

## Configuration

After enabling the module:

1. Each user opens **Connect OpenRouter** in Module Settings and signs in with OAuth.
2. Each user can choose their own text/image models from OpenRouter-powered dropdowns in Module Settings.

There is also an optional manual API key field in the OpenRouter account dialog.
Desktop Foundry OAuth uses your default browser and a temporary local callback listener on `localhost:3000`.
If `localhost:3000` is already in use, OAuth login will fail until that port is freed.
Model dropdown choices are loaded from OpenRouter during startup; restart Foundry to refresh the list.

## Usage

1. Open any scene as GM and use the *Handy Dandy Tools* control group.
2. Open Prompt Workbench from Handy Dandy Tools.
3. AI features use the current user's OpenRouter-connected account.

## Split Repos

- `handy-dandy-core`: shared runtime and scene-controls registry.
- `handy-dandy-conjur`: OpenRouter integration, Prompt Workbench, rule element generation, remix flows, and AI image generation.
- `handy-dandy-tools`: Rune Stripper, Map Notes, token HUD preview, and other utility tools.

## Documentation

- [Development Guide](docs/development.md)

## Compatibility

The module targets Foundry **V13** and is tested with the **pf2e** system.

## License

MIT

# Handy Dandy

Handy Dandy is a utility module for **Foundry VTT** with GM tooling and AI-assisted workflows.
It is written in TypeScript and built with Webpack.

## Features

- **Schema Tool**: Inspect the data model of any Foundry document.
- **Data Entry Tool**: Reformat Pathfinder 2e / Starfinder 2e text into Foundry-ready rich text.
- **Trait Browser Tool**: Browse PF2e trait dictionaries and copy trait slugs quickly.
- **OpenRouter integration**: Connect each user account with OpenRouter OAuth, then use that account for generation and image workflows.

Both tools are available from a *Handy Dandy Tools* control group in scene controls (GM only).

## Installation

Pre-built releases are available on the project page. To install manually, copy the contents of `dist/` to:

`FoundryVTT/Data/modules/handy-dandy/`

To build locally:

```bash
npm install
npm run build
```

The build writes compiled files to `dist/` and transforms `src/static/module.json` with package metadata.

## Configuration

After enabling the module:

1. Each user opens **Connect OpenRouter** in Module Settings and signs in with OAuth.
2. Each user can choose their own text/image model IDs in Module Settings.

There is also an optional manual API key field in the OpenRouter account dialog.
Desktop Foundry OAuth uses your default browser and a temporary local callback listener on `localhost:3000`.
If `localhost:3000` is already in use, OAuth login will fail until that port is freed.

## Usage

1. Open any scene as GM and use the *Handy Dandy Tools* control group.
2. Open tools like Schema Tool, Data Entry Tool, Export Selection, or Prompt Workbench.
3. AI features use the current user's OpenRouter-connected account.

## Developer Helpers

GMs and users with developer mode enabled gain access to `game.handyDandy.dev`:

- `generateAction(input, options?)`: Runs the generation pipeline and logs payloads.
- `validate(type, payload, options?)`: Runs schema validation/repair (can disable GPT fallback with `useGPT: false`).
- `importAction(json, options?)`: Runs import sanity checks and import workflow.

## Documentation

- [Development Guide](docs/development.md)

## Compatibility

The module targets Foundry **V13** and is tested with the **pf2e** system.

## License

MIT

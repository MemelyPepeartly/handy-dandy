# Handy Dandy

Handy Dandy is a small utility module for **Foundry VTT** that exposes a couple
of GM tools and provides a place to use OpenAI from within the client.  It is
written in TypeScript and built with Webpack.

## Features

- **Schema Tool** – inspect the data model of any Foundry document.  The tool
  lets you pick a document type and shows its schema in a tree view.  Clicking a
  row copies the field path to the clipboard.
- **Data Entry Tool** – reformat Pathfinder 2e / Starfinder 2e rules text into
  Foundry-ready rich text.  Options exist to add condition links, action icons
  and other tweaks.  The module is a straight port of the original Python script
  used by the maintainer.
- **OpenAI integration** – the module stores an OpenAI client on
  `game.handyDandy.openai` once you enter your API key.  Other modules or macros
  can make use of this client.

Both tools are available from a new *Handy Dandy Tools* control group in the
scene controls (GM only).

## Installation

Pre-built releases are available on the project page.  To install manually, drop
the contents of the `dist` folder into
`FoundryVTT/Data/modules/handy-dandy/` and import the bundled `module.json` in
the Foundry module manager.

If you wish to build the module yourself:

```bash
npm install
npm run build
```

The build step writes all compiled files to `dist/` and transforms
`src/static/module.json` with the correct package name and version.

A helper script `deploy/deploy.js` (or the `npm test` script) can copy the build
output directly into your local `FoundryVTT/Data/modules` directory on Windows.

## Configuration

After enabling the module a GM can open **Configure Settings → Module Settings**
and provide the following options:

- **GPT API Key** – your OpenAI API key.
- **GPT Organization** – optional organization ID.

These settings are used to initialise the OpenAI SDK when the game is ready.

## Usage

1. Open any scene as a GM and look for the new *Handy Dandy Tools* control
   group.
2. Click the *Schema Tool* or *Data Entry Tool* buttons to open the respective
   window.
3. The OpenAI client is available to other macros as `game.handyDandy.openai` if
   configured.

## Compatibility

The module targets Foundry **V12** and is tested with the **pf2e** system.  The
exact compatibility versions are listed in `src/static/module.json`.

## License

This repository is released under the MIT license.

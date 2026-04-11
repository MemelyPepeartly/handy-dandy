# Development Guide

This repo is the original monolith and now serves as the reference/compatibility source while the split repos mature.

## When to change this repo

- Change it when maintaining the original `handy-dandy` module.
- Change it when extracting behavior into `handy-dandy-core`, `handy-dandy-conjur`, or `handy-dandy-tools`.
- Do not add new cross-cutting architecture here first if it clearly belongs in a split repo.

## Split destinations

- Shared runtime and toolbar shell: `handy-dandy-core`
- OpenRouter and AI generation flows: `handy-dandy-conjur`
- Rune Stripper, Map Notes, and other utility tools: `handy-dandy-tools`

## Monolith maintenance rules

1. Preserve `game.handyDandy.*` compatibility unless explicitly changing the monolith API.
2. Keep OpenRouter and PF2E behavior aligned with the existing module contracts.
3. When extracting code, preserve behavior first; refactor after the split module is stable.

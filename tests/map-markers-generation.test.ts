import assert from "node:assert/strict";
import { test } from "node:test";

import { buildMapMarkerBoxTextPrompt } from "../src/scripts/map-markers/generation";

test("buildMapMarkerBoxTextPrompt includes marker context and authoring constraints", () => {
  const prompt = buildMapMarkerBoxTextPrompt({
    kind: "specific-room",
    prompt: "Collapsed observatory chamber with a cracked lens array.",
    areaTheme: "Dusty, arcane, and ominously quiet.",
  });

  assert.match(prompt, /Marker type: Specific Room/);
  assert.match(prompt, /Collapsed observatory chamber/);
  assert.match(prompt, /Dusty, arcane, and ominously quiet/);
  assert.match(prompt, /2-4 sentences/);
  assert.match(prompt, /Do not include mechanics/);
});

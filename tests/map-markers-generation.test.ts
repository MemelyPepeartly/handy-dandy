import assert from "node:assert/strict";
import { test } from "node:test";

import { buildMapMarkerBoxTextPrompt } from "../src/scripts/map-markers/generation";

test("buildMapMarkerBoxTextPrompt includes marker context and authoring constraints", () => {
  const prompt = buildMapMarkerBoxTextPrompt({
    kind: "specific-room",
    title: "Collapsed Observatory",
    prompt: "Collapsed observatory chamber with a cracked lens array.",
    areaTheme: "Dusty, arcane, and ominously quiet.",
    sensoryDetails: "Cold air, drifting dust, and a faint metallic tang.",
    notableFeatures: "Broken telescope, cracked star chart mural, and fractured crystal lens.",
    occupants: "No creatures present, but fresh claw marks suggest recent movement.",
    hazards: "Loose floor stones and a hanging lens frame ready to fall.",
    gmNotes: "A hidden cult sigil is under the mural plaster.",
    tone: "ominous",
    boxTextLength: "long",
    includeGmNotes: false,
  });

  assert.match(prompt, /Marker type: Specific Room/);
  assert.match(prompt, /Area title: Collapsed Observatory/);
  assert.match(prompt, /Collapsed observatory chamber/);
  assert.match(prompt, /Dusty, arcane, and ominously quiet/);
  assert.match(prompt, /Target length: 5-7 sentences/);
  assert.match(prompt, /Narrative tone target: foreboding and tense/);
  assert.match(prompt, /Treat GM notes as private prep only/);
  assert.match(prompt, /Do not include mechanics/);
});

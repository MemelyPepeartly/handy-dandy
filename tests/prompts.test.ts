import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildActionPrompt,
  buildActorPrompt,
  buildItemPrompt,
  type CorrectionContext,
} from "../src/scripts/prompts/index";

const correction: CorrectionContext = {
  summary: "itemType must use the canonical enum values",
  previous: {
    schema_version: 3,
    systemId: "pf2e",
    type: "item",
    slug: "bad-item",
    name: "Bad Item",
    itemType: "equipmint",
    rarity: "common",
    level: 1,
  },
};

test("buildActionPrompt includes schema, request details, and PF2E formatting constraints", () => {
  const prompt = buildActionPrompt({
    systemId: "pf2e",
    title: "Twin Slash",
    slug: "twin-slash",
    referenceText: "Trigger: The foe moves.\nEffect: You strike twice.",
  });

  assert.match(prompt, /Generate a Foundry VTT Action JSON document\./);
  assert.match(prompt, /Use the requested systemId: "pf2e"\./);
  assert.match(prompt, /Slug suggestion: twin-slash/);
  assert.match(prompt, /Create a pf2e action entry titled "Twin Slash"\./);
  assert.match(prompt, /@Check/);
  assert.match(prompt, /@Damage/);
  assert.match(prompt, /@Template/);
  assert.match(prompt, /canonical name\/slug/i);
});

test("buildItemPrompt embeds correction context and style-guide constraints", () => {
  const prompt = buildItemPrompt({
    systemId: "pf2e",
    name: "Healing Potion",
    slug: "healing-potion",
    referenceText: "A restorative concoction.",
    itemType: "consumable",
    correction,
  });

  assert.match(prompt, /Correction context:/);
  assert.match(prompt, /itemType must use the canonical enum values/);
  assert.match(prompt, /Item type: consumable\./);
  assert.match(prompt, /@Check/);
  assert.match(prompt, /@Damage/);
  assert.match(prompt, /@UUID condition links/i);
  assert.match(prompt, /Use HTML <p> tags/);
});

test("buildActorPrompt includes PF2E structure expectations, inventory support, and token options", () => {
  const prompt = buildActorPrompt({
    systemId: "sf2e",
    name: "Android Sentry",
    referenceText: "Guardian of the ancient vault.",
    includeInventory: true,
    includeSpellcasting: true,
    generateTokenImage: true,
    tokenPrompt: "glass visor and luminous rune sigils",
  });

  assert.match(prompt, /Generate a Foundry VTT Actor JSON document\./);
  assert.match(prompt, /Use the requested systemId: "sf2e"\./);
  assert.match(prompt, /inventory: optional array of carried items/i);
  assert.match(prompt, /official PF2E NPC source structures/i);
  assert.match(prompt, /Include spellcasting data/);
  assert.match(prompt, /List an inventory section/);
  assert.match(prompt, /transparent token image generation/i);
  assert.match(prompt, /Token image direction: glass visor and luminous rune sigils/);
});


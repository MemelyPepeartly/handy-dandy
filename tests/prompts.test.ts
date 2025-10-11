import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildActionPrompt,
  buildActorPrompt,
  buildItemPrompt,
  type CorrectionContext
} from "../src/scripts/prompts/index";

const sampleReference = `Trigger: The foe moves.\nEffect: You strike twice.`;

const correction: CorrectionContext = {
  summary: "itemType must use the canonical enum values",
  previous: {
    schema_version: 2,
    systemId: "pf2e",
    type: "item",
    slug: "bad-item",
    name: "Bad Item",
    itemType: "equipmint",
    rarity: "common",
    level: 1
  }
};

test("buildActionPrompt renders the expected deterministic text", () => {
  const prompt = buildActionPrompt({
    systemId: "pf2e",
    title: "Twin Slash",
    slug: "twin-slash",
    referenceText: sampleReference
  });

  const expected = `Generate a Foundry VTT Action JSON document.\n\nAlways respond with valid JSON matching the schema. Do not add commentary.\n\nSystem ID handling:\n- Allowed values:\n- pf2e\n- sf2e\n- Use the requested systemId: "pf2e".\n\nAction schema overview:\n- schema_version: integer literal 2.\n- type: string literal "action".\n- slug: non-empty string.\n- name: non-empty string.\n- actionType: string enum value (choose from: one-action, two-actions, three-actions, free, reaction).\n- description: non-empty string containing the full action rules.\n- traits: optional array of non-empty strings; defaults to [].\n- requirements: optional string; defaults to "".\n- img: optional string containing an image URL or Foundry asset path; defaults to null.\n- rarity: optional string enum (common, uncommon, rare, unique); defaults to "common".\n- source: optional string; defaults to "".\n\nUser request:\n\nCreate a pf2e action entry titled "Twin Slash".\n\nSlug suggestion: twin-slash\n\nUse the reference text verbatim where appropriate:\n\nTrigger: The foe moves.\nEffect: You strike twice.\n\nReminder: Apply any corrections precisely and ensure the final JSON satisfies every constraint before responding.`;

  assert.equal(prompt, expected);
});

test("buildItemPrompt includes correction context to fix enum typos", () => {
  const prompt = buildItemPrompt({
    systemId: "pf2e",
    name: "Healing Potion",
    slug: "healing-potion",
    referenceText: "A restorative concoction.",
    correction
  });

  const expected = `Generate a Foundry VTT Item JSON document.\n\nAlways respond with valid JSON matching the schema. Do not add commentary.\n\nSystem ID handling:\n- Allowed values:\n- pf2e\n- sf2e\n- Use the requested systemId: "pf2e".\n\nCorrection context:\n- Reason: itemType must use the canonical enum values\n- Previous draft (update instead of recreating blindly):\n{\n  "schema_version": 2,\n  "systemId": "pf2e",\n  "type": "item",\n  "slug": "bad-item",\n  "name": "Bad Item",\n  "itemType": "equipmint",\n  "rarity": "common",\n  "level": 1\n}\n\nItem schema overview:\n- schema_version: integer literal 2.\n- type: string literal "item".\n- slug: non-empty string.\n- name: non-empty string.\n- itemType: string enum (armor, weapon, equipment, consumable, feat, spell, wand, staff, other).\n- rarity: string enum (common, uncommon, rare, unique).\n- level: integer >= 0.\n- price: optional number >= 0; defaults to 0.\n- traits: optional array of non-empty strings; defaults to [].\n- description: optional string; defaults to "".\n- img: optional string containing an image URL or Foundry asset path; defaults to null.\n- source: optional string; defaults to "".\n\nUser request:\n\nCreate a pf2e item entry named "Healing Potion".\n\nSlug suggestion: healing-potion\n\nBase your response on the following text:\n\nA restorative concoction.\n\nReminder: Apply any corrections precisely and ensure the final JSON satisfies every constraint before responding.`;

  assert.equal(prompt, expected);
});

test("buildActorPrompt references the actor schema and defaults", () => {
  const prompt = buildActorPrompt({
    systemId: "sf2e",
    name: "Android Sentry",
    referenceText: "Guardian of the ancient vault."
  });

  const expected = `Generate a Foundry VTT Actor JSON document.\n\nAlways respond with valid JSON matching the schema. Do not add commentary.\n\nSystem ID handling:\n- Allowed values:\n- pf2e\n- sf2e\n- Use the requested systemId: "sf2e".\n\nActor schema overview:\n- schema_version: integer literal 2.\n- type: string literal "actor".\n- slug: non-empty string.\n- name: non-empty string.\n- actorType: string enum (character, npc, hazard, vehicle, familiar).\n- rarity: string enum (common, uncommon, rare, unique).\n- level: integer >= 0.\n- traits: optional array of non-empty strings; defaults to [].\n- languages: optional array of non-empty strings; defaults to [].\n- img: optional string containing an image URL or Foundry asset path; defaults to null.\n- source: optional string; defaults to "".\n\nUser request:\n\nCreate a sf2e actor entry named "Android Sentry".\n\nSummarise the following reference text into structured data:\n\nGuardian of the ancient vault.\n\nReminder: Apply any corrections precisely and ensure the final JSON satisfies every constraint before responding.`;

  assert.equal(prompt, expected);
});

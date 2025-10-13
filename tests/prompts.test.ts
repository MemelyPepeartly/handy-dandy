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
    schema_version: 3,
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

  const expected = `Generate a Foundry VTT Action JSON document.\n\nAlways respond with valid JSON matching the schema. Do not add commentary.\n\nSystem ID handling:\n- Allowed values:\n- pf2e\n- sf2e\n- Use the requested systemId: "pf2e".\n\nAction schema overview:\n- schema_version: integer literal 3.\n- type: string literal "action".\n- slug: non-empty string.\n- name: non-empty string.\n- actionType: string enum value (choose from: one-action, two-actions, three-actions, free, reaction).\n- description: non-empty string containing the full action rules.\n- traits: optional array of lowercase PF2e trait slugs drawn from the active system; defaults to [].\n- requirements: optional string; defaults to "".\n- img: optional string containing an image URL or Foundry asset path; defaults to null.\n- rarity: optional string enum (common, uncommon, rare, unique); defaults to "common".\n- source: optional string; defaults to "".\n- publication: object { title, authors, license, remaster }; defaults to {"title":"","authors":"","license":"OGL","remaster":false}.\n\nUser request:\n\nCreate a pf2e action entry titled "Twin Slash".\n\nSlug suggestion: twin-slash\n\nUse the reference text verbatim where appropriate:\n\nTrigger: The foe moves.\nEffect: You strike twice.\n\nReminder: Apply any corrections precisely and ensure the final JSON satisfies every constraint before responding.`;

  assert.equal(prompt, expected);
});

test("buildItemPrompt includes correction context to fix enum typos", () => {
  const prompt = buildItemPrompt({
    systemId: "pf2e",
    name: "Healing Potion",
    slug: "healing-potion",
    referenceText: "A restorative concoction.",
    itemType: "consumable",
    correction
  });

  const expected = `Generate a Foundry VTT Item JSON document.\n\nAlways respond with valid JSON matching the schema. Do not add commentary.\n\nSystem ID handling:\n- Allowed values:\n- pf2e\n- sf2e\n- Use the requested systemId: "pf2e".\n\nCorrection context:\n- Reason: itemType must use the canonical enum values\n- Previous draft (update instead of recreating blindly):\n{\n  "schema_version": 3,\n  "systemId": "pf2e",\n  "type": "item",\n  "slug": "bad-item",\n  "name": "Bad Item",\n  "itemType": "equipmint",\n  "rarity": "common",\n  "level": 1\n}\n\nItem schema overview:\n- schema_version: integer literal 3.\n- type: string literal "item".\n- slug: non-empty string.\n- name: non-empty string.\n- itemType: string enum (armor, weapon, equipment, consumable, feat, spell, wand, staff, other).\n- rarity: string enum (common, uncommon, rare, unique).\n- level: integer >= 0.\n- price: optional number >= 0; defaults to 0.\n- traits: optional array of lowercase PF2e trait slugs from the active system; defaults to [].\n- description: optional string containing PF2e-formatted HTML box text; defaults to "".\n- Format the description with HTML <p> paragraphs: start with italicised flavour text (<em>) then add mechanical paragraphs that cover activation, usage, damage, and other rules that fulfil the request.\n- Summarise the requested mechanics instead of copying the prompt verbatim; explicitly mention damage dice, conditions, and other effects referenced in the request.\n- img: optional string containing an image URL or Foundry asset path; defaults to null. When omitted, apply the category default (armor → shield.svg, weapon → weapon.svg, equipment/other → equipment.svg, consumable → consumable.svg, feat → feat.svg, spell → spell.svg, wand → wand.svg, staff → staff.svg).\n- source: optional string; defaults to "".\n- publication: object { title, authors, license, remaster }; defaults to {"title":"","authors":"","license":"OGL","remaster":false}.\n- Always include every top-level property in the JSON response using this canonical set: schema_version, systemId, type, slug, name, itemType, rarity, level, price, traits, description, img, source, publication.\n- When a property is optional, include it with the default value to preserve the exact structure shown in the reference assets.\n\nUser request:\n\nCreate a pf2e item entry named "Healing Potion".\n\nSlug suggestion: healing-potion\n\nItem type: consumable. Set the "itemType" field to this exact value.\n\nBase your response on the following text:\n\nA restorative concoction.\n\nDescription guidelines:\n- Write brand-new Pathfinder Second Edition item rules that realise the request without echoing it word for word.\n- Use HTML <p> tags in the description; begin with <p><em>flavour text</em></p> followed by mechanical paragraphs.\n- Call out level-appropriate activation details, usage requirements, damage dice, conditions, and other mechanical effects that the prompt implies.\n\nReminder: Apply any corrections precisely and ensure the final JSON satisfies every constraint before responding.`;

  assert.equal(prompt, expected);
});

test("buildActorPrompt references the actor schema and defaults", () => {
  const prompt = buildActorPrompt({
    systemId: "sf2e",
    name: "Android Sentry",
    referenceText: "Guardian of the ancient vault."
  });

  const expected = `Generate a Foundry VTT Actor JSON document.\n\nAlways respond with valid JSON matching the schema. Do not add commentary.\n\nSystem ID handling:\n- Allowed values:\n- pf2e\n- sf2e\n- Use the requested systemId: "sf2e".\n\nActor schema overview:\n- schema_version: integer literal 3.\n- type: string literal "actor".\n- slug: non-empty string.\n- name: non-empty string.\n- actorType: string enum (character, npc, hazard, vehicle, familiar).\n- rarity: string enum (common, uncommon, rare, unique).\n- level: integer >= 0.\n- size: string enum (tiny, sm, med, lg, huge, grg).\n- traits: array of lowercase PF2e trait slugs from the active system; defaults to [].\n- alignment: optional string; defaults to null.\n- languages: array of strings; defaults to [].\n- attributes: object describing defences and movement.\n  - hp: { value, max, temp, details } with non-negative integers for value, max, and temp.\n  - ac: { value, details } with integer value.\n  - perception: { value, details, senses } where senses is an array of lowercase strings.\n  - speed: { value, details, other } with other = array of { type, value, details } entries.\n  - saves: { fortitude, reflex, will } each { value, details }.\n  - immunities/weaknesses/resistances: arrays of objects with typed entries; defaults to [].\n- abilities: object with str, dex, con, int, wis, cha modifiers (integers).\n- skills: array of { slug, modifier, details } entries; defaults to [].\n- strikes: array of attacks { name, type (melee|ranged), attackBonus, traits, damage[], effects, description } with each damage entry { formula, damageType, notes } and traits using valid PF2e slugs.\n- actions: array of special abilities { name, actionCost (one-action|two-actions|three-actions|free|reaction|passive), traits, requirements, trigger, frequency, description } with traits limited to valid PF2e slugs.\n- spellcasting: optional array of entries { name, tradition, castingType (prepared|spontaneous|innate|focus|ritual), attackBonus, saveDC, notes, spells[] } where spells are { level, name, description, tradition }.\n- description: optional string; defaults to null.\n- recallKnowledge: optional string; defaults to null.\n- img: string or null containing an image URL or Foundry asset path; defaults to "systems/pf2e/icons/default-icons/npc.svg".\n- source: string; defaults to "".\n- publication: object { title, authors, license, remaster }; defaults to {"title":"","authors":"","license":"OGL","remaster":false}.\n\nUser request:\n\nCreate a sf2e actor entry named "Android Sentry".\n\nSummarise the following reference text into structured data:\n\nGuardian of the ancient vault.\n\nReminder: Apply any corrections precisely and ensure the final JSON satisfies every constraint before responding.`;

  assert.equal(prompt, expected);
});

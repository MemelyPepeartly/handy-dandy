import assert from "node:assert/strict";
import { test } from "node:test";
import type { ErrorObject } from "ajv";
import {
  ensureValid,
  EnsureValidError,
  type EnsureValidDiagnostics,
} from "../src/scripts/validation/ensure-valid";
import type { JsonSchemaDefinition, GPTClient } from "../src/scripts/gpt/client";

(globalThis as { CONFIG?: unknown }).CONFIG = {
  PF2E: {
    actionTraits: {
      attack: "PF2E.TraitAttack",
      auditory: "PF2E.TraitAuditory",
      fighter: "PF2E.TraitFighter",
      press: "PF2E.TraitPress",
    },
    itemTraits: {
      magical: "PF2E.ItemTraitMagical",
      invested: "PF2E.ItemTraitInvested",
    },
    weaponTraits: {
      agile: "PF2E.WeaponTraitAgile",
      reach: "PF2E.WeaponTraitReach",
      "deadly-d8": "PF2E.WeaponTraitDeadlyD8",
    },
    creatureTraits: {
      brute: "PF2E.CreatureTraitBrute",
      human: "PF2E.CreatureTraitHuman",
      scout: "PF2E.CreatureTraitScout",
    },
    traitDescriptions: {},
  },
};

class StubGPTClient {
  public calls: Array<{ prompt: string; schema: JsonSchemaDefinition }> = [];
  private readonly responses: Array<unknown> = [];

  enqueue(response: unknown): void {
    this.responses.push(response);
  }

  async generateWithSchema<T>(
    prompt: string,
    schema: JsonSchemaDefinition,
    _options?: { seed?: number },
  ): Promise<T> {
    this.calls.push({ prompt, schema });
    const response = this.responses.shift();
    if (response instanceof Error) {
      throw response;
    }
    if (response === undefined) {
      throw new Error("No stubbed response available");
    }
    return response as T;
  }
}

test("ensureValid normalises PF2e payloads before validation", async () => {
  const payload = {
    schema_version: "2",
    systemId: "PF2E",
    type: "Action",
    slug: "  test-action  ",
    name: "  Test Action  ",
    actionType: "One Action",
    traits: [" attack ", ""],
    description: "A quick action.",
    requirements: null,
    img: "  ",
    rarity: "Common",
    extra: "should disappear",
  };

  const result = await ensureValid({ type: "action", payload });

  assert.equal(result.schema_version, 3);
  assert.equal(result.systemId, "pf2e");
  assert.equal(result.type, "action");
  assert.equal(result.slug, "test-action");
  assert.equal(result.name, "Test Action");
  assert.equal(result.actionType, "one-action");
  assert.deepEqual(result.traits, ["attack"]);
  assert.equal(result.requirements, "");
  assert.equal(result.img, null);
  assert.equal(result.rarity, "common");
  assert.equal(result.source, "");
  assert.equal(Object.hasOwn(result as Record<string, unknown>, "extra"), false);
});

test("ensureValid filters traits to the PF2e dictionary", async () => {
  const payload = {
    schema_version: 3,
    systemId: "pf2e",
    type: "actor",
    slug: "filtered-actor",
    name: "Filtered Actor",
    actorType: "npc",
    rarity: "common",
    level: 1,
    size: "med",
    traits: ["brute", "mystery"],
    languages: ["Common"],
    attributes: {
      hp: { value: 15, max: 15 },
      ac: { value: 18 },
      perception: { value: 6 },
      speed: { value: 25 },
      saves: {
        fortitude: { value: 6 },
        reflex: { value: 6 },
        will: { value: 6 },
      },
    },
    abilities: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
    skills: [],
    strikes: [
      {
        name: "Claw",
        type: "melee",
        attackBonus: 10,
        traits: ["agile", "unknown-strike"],
        damage: [{ formula: "1d6+4", damageType: "slashing", notes: "" }],
        effects: [
          "Grab",
          "@UUID[Compendium.pf2e.conditionitems.Item.Dazzled]{Dazzled}",
          "grab",
        ],
        description: "A vicious swipe.",
      },
    ],
    actions: [
      {
        name: "Terrifying Roar",
        actionCost: "one-action",
        description: "An unsettling roar.",
        traits: ["auditory", "mystery-action"],
      },
    ],
    img: null,
    source: "",
  } as const;

  const result = await ensureValid({ type: "actor", payload });

  assert.deepEqual(result.traits, ["brute"]);
  assert.equal(result.languages.length, 1);
  assert.deepEqual(result.strikes[0]?.traits, ["agile"]);
  assert.deepEqual(result.strikes[0]?.effects, [
    "Grab",
    "@UUID[Compendium.pf2e.conditionitems.Item.Dazzled]{Dazzled}",
  ]);
  assert.deepEqual(result.actions[0]?.traits, ["auditory"]);
});

test("ensureValid normalizes loot and hazard actor-type settings", async () => {
  const lootPayload = {
    schema_version: 3,
    systemId: "pf2e",
    type: "actor",
    slug: "vault-cache",
    name: "Vault Cache",
    actorType: "loot",
    rarity: "common",
    level: 2,
    size: "med",
    traits: [],
    languages: [],
    attributes: {
      hp: { value: 1, max: 1 },
      ac: { value: 10 },
      perception: { value: 0 },
      speed: { value: 0 },
      saves: {
        fortitude: { value: 0 },
        reflex: { value: 0 },
        will: { value: 0 },
      },
    },
    abilities: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
    skills: [],
    strikes: [],
    actions: [],
    loot: {
      lootSheetType: "merchant",
      hiddenWhenEmpty: "true",
    },
    img: null,
    source: "",
  };

  const lootResult = await ensureValid({ type: "actor", payload: lootPayload });
  assert.deepEqual(lootResult.loot, { lootSheetType: "Merchant", hiddenWhenEmpty: true });
  assert.equal(lootResult.hazard, null);

  const hazardPayload = {
    ...lootPayload,
    slug: "hall-of-blades",
    name: "Hall of Blades",
    actorType: "hazard",
    hazard: {
      isComplex: "true",
      disable: "Thievery DC 24",
      routine: "2d8 slashing damage each round.",
      reset: "Resets each dawn.",
      emitsSound: "false",
      hardness: "7",
      stealthBonus: "12",
      stealthDetails: "Concealed hinges.",
    },
    loot: {
      lootSheetType: "Loot",
      hiddenWhenEmpty: false,
    },
  };

  const hazardResult = await ensureValid({ type: "actor", payload: hazardPayload });
  assert.equal(hazardResult.hazard?.isComplex, true);
  assert.equal(hazardResult.hazard?.emitsSound, false);
  assert.equal(hazardResult.hazard?.hardness, 7);
  assert.equal(hazardResult.hazard?.stealthBonus, 12);
  assert.equal(hazardResult.hazard?.stealthDetails, "Concealed hinges.");
  assert.equal(hazardResult.loot, null);
});

test("ensureValid uses GPT repair when Ajv validation fails", async () => {
  const stub = new StubGPTClient();
  stub.enqueue({
    schema_version: 3,
    systemId: "pf2e",
    type: "item",
    slug: "test-item",
    name: "Test Item",
    itemType: "wand",
    rarity: "common",
    level: 3,
    price: 15,
    traits: ["magical"],
    description: "A repaired wand.",
    source: "",
  });

  const payload = {
    schema_version: 3,
    systemId: "pf2e",
    type: "item",
    slug: "test-item",
    name: "Test Item",
    itemType: "wand",
    rarity: "legendary",
    level: "3",
    extra: true,
  };

  const result = await ensureValid({
    type: "item",
    payload,
    gptClient: stub as unknown as GPTClient,
  });

  assert.equal(stub.calls.length, 1);
  assert.equal(result.rarity, "common");
  assert.equal(result.price, 15);
  assert.deepEqual(result.traits, ["magical"]);
  assert.equal(Object.hasOwn(result as Record<string, unknown>, "extra"), false);
});

test("ensureValid throws typed error with diagnostics after exhausting retries", async () => {
  const stub = new StubGPTClient();
  stub.enqueue({
    schema_version: 3,
    systemId: "pf2e",
    type: "item",
    slug: "broken-item",
    name: "Broken Item",
    itemType: "wand",
    rarity: "legendary",
    level: 1,
    source: "",
  });

  const payload = {
    schema_version: 3,
    systemId: "pf2e",
    type: "item",
    slug: "broken-item",
    name: "Broken Item",
    itemType: "wand",
    rarity: "legendary",
    level: 1,
  };

  try {
    await ensureValid({
      type: "item",
      payload,
      gptClient: stub as unknown as GPTClient,
      maxAttempts: 2,
    });
    assert.fail("Expected ensureValid to throw");
  } catch (error) {
    assert.ok(error instanceof EnsureValidError);
    const ensureError = error as EnsureValidError<"item">;
    assert.equal(ensureError.diagnostics.length, 2);
    assert.equal(ensureError.originalPayload?.slug, "broken-item");
    assert.equal((ensureError.lastPayload as { rarity?: string }).rarity, "legendary");

    const [firstAttempt] = ensureError.diagnostics as EnsureValidDiagnostics<"item">[];
    assert.ok(Array.isArray(firstAttempt.errors));
    assert.ok(firstAttempt.errors.some((err: ErrorObject) => err.instancePath === "/rarity"));
  }
});

test("EnsureValidError exposes a repair helper that retries GPT fixes", async () => {
  const stub = new StubGPTClient();
  stub.enqueue({
    schema_version: 3,
    systemId: "pf2e",
    type: "item",
    slug: "retry-item",
    name: "Retry Item",
    itemType: "wand",
    rarity: "legendary",
    level: 1,
    source: "",
  });

  const payload = {
    schema_version: 3,
    systemId: "pf2e",
    type: "item",
    slug: "retry-item",
    name: "Retry Item",
    itemType: "wand",
    rarity: "legendary",
    level: 1,
  };

  try {
    await ensureValid({
      type: "item",
      payload,
      gptClient: stub as unknown as GPTClient,
      maxAttempts: 2,
    });
    assert.fail("Expected ensureValid to throw");
  } catch (error) {
    assert.ok(error instanceof EnsureValidError);
    const ensureError = error as EnsureValidError<"item">;
    assert.equal(stub.calls.length, 1);

    stub.enqueue({
      schema_version: 3,
      systemId: "pf2e",
      type: "item",
      slug: "retry-item",
      name: "Retry Item",
      itemType: "wand",
      rarity: "common",
      level: 1,
      price: 50,
      traits: ["magical"],
      description: "A repaired wand.",
      source: "",
    });

    const repaired = await ensureError.repair();
    assert.equal(stub.calls.length, 2);
    assert.equal(repaired.rarity, "common");
    assert.equal(repaired.price, 50);
  }
});

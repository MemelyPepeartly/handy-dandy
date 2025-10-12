import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_GENERATION_SEED,
  generateAction,
  generateActor,
  generateItem,
} from "../src/scripts/generation";
import { toFoundryActorData } from "../src/scripts/mappers/import";
import type { JsonSchemaDefinition } from "../src/scripts/gpt/client";
import type {
  ActionSchemaData,
  ActorSchemaData,
  ItemSchemaData,
} from "../src/scripts/schemas";
import type {
  ActionPromptInput,
  ActorPromptInput,
  ItemPromptInput,
} from "../src/scripts/prompts";
import { cloneFixture, loadFixture } from "./helpers/fixtures";

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

interface RecordedCall {
  prompt: string;
  schema: JsonSchemaDefinition;
  seed?: number;
}

class FixtureGPTClient {
  public calls: RecordedCall[] = [];

  constructor(
    private readonly fixtures: {
      Action: ActionSchemaData;
      Item: ItemSchemaData;
      Actor: ActorSchemaData;
    },
  ) {}

  async generateWithSchema<T>(
    prompt: string,
    schema: JsonSchemaDefinition,
    options?: { seed?: number },
  ): Promise<T> {
    const seed = options?.seed;
    this.calls.push({ prompt, schema, seed });
    const payload = this.resolveFixture(schema.name);
    return cloneFixture(payload) as T;
  }

  private resolveFixture(name: string): ActionSchemaData | ItemSchemaData | ActorSchemaData {
    switch (name.toLowerCase()) {
      case "action":
        return this.fixtures.Action;
      case "item":
        return this.fixtures.Item;
      case "actor":
        return this.fixtures.Actor;
      default:
        throw new Error(`Unsupported schema: ${name}`);
    }
  }
}

const actionFixture = loadFixture<ActionSchemaData>("action.json");
const itemFixture = loadFixture<ItemSchemaData>("item.json");
const actorFixture = loadFixture<ActorSchemaData>("actor.json");

const baseActionInput: ActionPromptInput = {
  systemId: "pf2e",
  title: "Whirlwind Slash",
  referenceText: "Perform a sweeping strike against nearby foes.",
};

const baseItemInput: ItemPromptInput = {
  systemId: "pf2e",
  name: "Mirror Shield",
  referenceText: "A polished shield that reflects magic.",
  itemType: "armor",
};

const baseActorInput: ActorPromptInput = {
  systemId: "pf2e",
  name: "Cautious Scout",
  referenceText: "A nimble scout who excels at reconnaissance.",
};

const createClient = (): FixtureGPTClient =>
  new FixtureGPTClient({ Action: actionFixture, Item: itemFixture, Actor: actorFixture });

test("generateAction yields deterministic results with identical input and seed", async () => {
  const client = createClient();
  const options = { gptClient: client, seed: 42 } as const;

  const first = await generateAction(baseActionInput, options);
  const second = await generateAction(baseActionInput, options);

  assert.deepStrictEqual(first, actionFixture, "tests/fixtures/action.json should be returned for action generation");
  assert.deepStrictEqual(second, actionFixture, "tests/fixtures/action.json should be returned for action generation");
  assert.equal(client.calls.length, 2);
  assert.ok(client.calls.every((call) => call.seed === 42));
});

test("generateItem defaults to the canonical seed for stable output", async () => {
  const client = createClient();
  const options = { gptClient: client } as const;

  const first = await generateItem(baseItemInput, options);
  const second = await generateItem(baseItemInput, options);

  assert.deepStrictEqual(first, itemFixture, "tests/fixtures/item.json should be returned for item generation");
  assert.deepStrictEqual(second, itemFixture, "tests/fixtures/item.json should be returned for item generation");
  assert.equal(client.calls.length, 2);
  assert.ok(client.calls.every((call) => call.seed === DEFAULT_GENERATION_SEED));
});

test("generateActor respects custom seeds for deterministic behaviour", async () => {
  const client = createClient();

  const first = await generateActor(baseActorInput, { gptClient: client, seed: 7 });
  const second = await generateActor(baseActorInput, { gptClient: client, seed: 7 });

  const canonical = cloneFixture(actorFixture) as ActorSchemaData;
  canonical.recallKnowledge = null;
  canonical.spellcasting = [];
  const foundry = toFoundryActorData(canonical);
  const expected = {
    schema_version: canonical.schema_version,
    systemId: canonical.systemId,
    slug: canonical.slug,
    name: foundry.name,
    type: foundry.type,
    img: foundry.img,
    system: foundry.system,
    prototypeToken: foundry.prototypeToken,
    items: foundry.items,
    effects: foundry.effects,
    folder: foundry.folder ?? null,
    flags: foundry.flags ?? {},
  };

  assert.deepStrictEqual(first, expected, "tests/fixtures/actor.json should produce a Foundry-ready actor");
  assert.deepStrictEqual(second, expected, "tests/fixtures/actor.json should produce a Foundry-ready actor");
  assert.ok(!("actorType" in first), "generated actors should not expose actorType");
  assert.equal(client.calls.length, 2);
  assert.ok(client.calls.every((call) => call.seed === 7));
});

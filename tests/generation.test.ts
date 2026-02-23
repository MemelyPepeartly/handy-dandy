import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_GENERATION_SEED,
  generateAction,
  generateActor,
  generateItem,
} from "../src/scripts/generation";
import { toFoundryActorData } from "../src/scripts/mappers/import";
import type { GeneratedImageResult, JsonSchemaDefinition } from "../src/scripts/openrouter/client";
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

class FixtureOpenRouterClient {
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

class FixtureImageOpenRouterClient extends FixtureOpenRouterClient {
  public imagePrompts: string[] = [];

  async generateImage(prompt: string): Promise<GeneratedImageResult> {
    this.imagePrompts.push(prompt);
    return {
      base64: "iVBORw0KGgo=",
      mimeType: "image/png",
    };
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

const createClient = (): FixtureOpenRouterClient =>
  new FixtureOpenRouterClient({ Action: actionFixture, Item: itemFixture, Actor: actorFixture });

test("generateAction yields deterministic results with identical input and seed", async () => {
  const client = createClient();
  const options = { openRouterClient: client, seed: 42 } as const;

  const first = await generateAction(baseActionInput, options);
  const second = await generateAction(baseActionInput, options);

  assert.deepStrictEqual(first, actionFixture, "tests/fixtures/action.json should be returned for action generation");
  assert.deepStrictEqual(second, actionFixture, "tests/fixtures/action.json should be returned for action generation");
  assert.equal(client.calls.length, 2);
  assert.ok(client.calls.every((call) => call.seed === 42));
});

test("generateItem defaults to the canonical seed for stable output", async () => {
  const client = createClient();
  const options = { openRouterClient: client } as const;

  const first = await generateItem(baseItemInput, options);
  const second = await generateItem(baseItemInput, options);

  assert.deepStrictEqual(first, itemFixture, "tests/fixtures/item.json should be returned for item generation");
  assert.deepStrictEqual(second, itemFixture, "tests/fixtures/item.json should be returned for item generation");
  assert.equal(client.calls.length, 2);
  assert.ok(client.calls.every((call) => call.seed === DEFAULT_GENERATION_SEED));
});

test("generateActor respects custom seeds for deterministic behaviour", async () => {
  const client = createClient();

  const first = await generateActor(baseActorInput, { openRouterClient: client, seed: 7 });
  const second = await generateActor(baseActorInput, { openRouterClient: client, seed: 7 });

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

test("generateActor keeps generated token art as actor and token image", async () => {
  const client = new FixtureImageOpenRouterClient({ Action: actionFixture, Item: itemFixture, Actor: actorFixture });
  const priorFilePicker = (globalThis as { FilePicker?: unknown }).FilePicker;
  (globalThis as { FilePicker?: unknown }).FilePicker = undefined;

  try {
    const generated = await generateActor(
      {
        ...baseActorInput,
        generateTokenImage: true,
      },
      { openRouterClient: client },
    );

    assert.ok(generated.img.startsWith("data:image/png;base64,"));
    const tokenSrc = ((generated.prototypeToken as { texture?: { src?: unknown } })?.texture?.src ?? "") as string;
    assert.equal(tokenSrc, generated.img);
  } finally {
    (globalThis as { FilePicker?: unknown }).FilePicker = priorFilePicker;
  }
});

test("generateItem can generate transparent icon art when enabled", async () => {
  const client = new FixtureImageOpenRouterClient({ Action: actionFixture, Item: itemFixture, Actor: actorFixture });
  const priorFilePicker = (globalThis as { FilePicker?: unknown }).FilePicker;
  (globalThis as { FilePicker?: unknown }).FilePicker = undefined;

  try {
    const generated = await generateItem(
      {
        ...baseItemInput,
        generateItemImage: true,
        itemImagePrompt: "ornate silver filigree",
      },
      { openRouterClient: client },
    );

    assert.ok(generated.img?.startsWith("data:image/png;base64,"));
    assert.equal(client.imagePrompts.length, 1);
    assert.match(client.imagePrompts[0], /Mirror Shield/);
  } finally {
    (globalThis as { FilePicker?: unknown }).FilePicker = priorFilePicker;
  }
});

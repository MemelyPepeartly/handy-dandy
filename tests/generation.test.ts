import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_GENERATION_SEED,
  generateAction,
  generateActor,
  generateItem,
} from "../src/scripts/generation";
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
  title: "Mirror Shield",
  referenceText: "A polished shield that reflects magic.",
};

const baseActorInput: ActorPromptInput = {
  systemId: "pf2e",
  title: "Cautious Scout",
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

  const expected = cloneFixture(actorFixture) as ActorSchemaData;
  expected.recallKnowledge = null;
  expected.spellcasting = [];

  assert.deepStrictEqual(first, expected, "tests/fixtures/actor.json should be returned for actor generation");
  assert.deepStrictEqual(second, expected, "tests/fixtures/actor.json should be returned for actor generation");
  assert.equal(client.calls.length, 2);
  assert.ok(client.calls.every((call) => call.seed === 7));
});

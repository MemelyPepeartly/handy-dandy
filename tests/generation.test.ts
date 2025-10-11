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

interface RecordedCall {
  prompt: string;
  schema: JsonSchemaDefinition;
  seed?: number;
}

class DeterministicGPTClient {
  public calls: RecordedCall[] = [];
  private counter = 0;
  private readonly cache = new Map<string, unknown>();

  async generateWithSchema<T>(
    prompt: string,
    schema: JsonSchemaDefinition,
    options?: { seed?: number },
  ): Promise<T> {
    const seed = options?.seed;
    this.calls.push({ prompt, schema, seed });
    const cacheKey = this.createCacheKey(schema.name, seed);
    if (!this.cache.has(cacheKey)) {
      this.cache.set(cacheKey, this.createPayload(schema.name, cacheKey));
    }
    const payload = this.cache.get(cacheKey);
    return JSON.parse(JSON.stringify(payload)) as T;
  }

  private createCacheKey(name: string, seed?: number): string {
    if (typeof seed === "number") {
      return `${name}:${seed}`;
    }
    const key = `${name}:auto-${this.counter}`;
    this.counter += 1;
    return key;
  }

  private createPayload(name: string, key: string): ActionSchemaData | ItemSchemaData | ActorSchemaData {
    const suffix = key.split(":")[1] ?? "0";
    switch (name) {
      case "Action":
        return {
          schema_version: 1,
          systemId: "pf2e",
          type: "action",
          slug: `test-action-${suffix}`,
          name: `Test Action ${suffix}`,
          actionType: "one-action",
          description: `Action description ${suffix}`,
          traits: [],
          requirements: "",
          img: "",
          rarity: "common",
        } satisfies ActionSchemaData;
      case "Item":
        return {
          schema_version: 1,
          systemId: "pf2e",
          type: "item",
          slug: `test-item-${suffix}`,
          name: `Test Item ${suffix}`,
          itemType: "armor",
          rarity: "common",
          level: 1,
          price: 12,
          traits: [],
          description: `Item description ${suffix}`,
          img: "",
        } satisfies ItemSchemaData;
      case "Actor":
        return {
          schema_version: 1,
          systemId: "pf2e",
          type: "actor",
          slug: `test-actor-${suffix}`,
          name: `Test Actor ${suffix}`,
          actorType: "character",
          rarity: "common",
          level: 1,
          traits: [],
          languages: [],
          img: "",
        } satisfies ActorSchemaData;
      default:
        throw new Error(`Unsupported schema: ${name}`);
    }
  }
}

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

test("generateAction yields deterministic results with identical input and seed", async () => {
  const client = new DeterministicGPTClient();
  const options = { gptClient: client, seed: 42 } as const;

  const first = await generateAction(baseActionInput, options);
  const second = await generateAction(baseActionInput, options);

  assert.deepEqual(second, first);
  assert.equal(client.calls.length, 2);
  assert.ok(client.calls.every((call) => call.seed === 42));
  assert.equal(first.slug, "test-action-42");
  assert.equal(first.schema_version, 1);
});

test("generateItem defaults to the canonical seed for stable output", async () => {
  const client = new DeterministicGPTClient();
  const options = { gptClient: client } as const;

  const first = await generateItem(baseItemInput, options);
  const second = await generateItem(baseItemInput, options);

  assert.deepEqual(second, first);
  assert.equal(client.calls.length, 2);
  assert.ok(client.calls.every((call) => call.seed === DEFAULT_GENERATION_SEED));
  assert.equal(first.rarity, "common");
});

test("generateActor respects custom seeds for deterministic behaviour", async () => {
  const client = new DeterministicGPTClient();

  const first = await generateActor(baseActorInput, { gptClient: client, seed: 7 });
  const second = await generateActor(baseActorInput, { gptClient: client, seed: 7 });

  assert.deepEqual(second, first);
  assert.equal(client.calls.length, 2);
  assert.ok(client.calls.every((call) => call.seed === 7));
  assert.equal(first.actorType, "character");
});

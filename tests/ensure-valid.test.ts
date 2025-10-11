import assert from "node:assert/strict";
import { test } from "node:test";
import type { ErrorObject } from "ajv";
import {
  ensureValid,
  EnsureValidError,
  type EnsureValidDiagnostics,
} from "../src/scripts/validation/ensure-valid";
import type { JsonSchemaDefinition, GPTClient } from "../src/scripts/gpt/client";

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
    schema_version: "1",
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

  assert.equal(result.schema_version, 1);
  assert.equal(result.systemId, "pf2e");
  assert.equal(result.type, "action");
  assert.equal(result.slug, "test-action");
  assert.equal(result.name, "Test Action");
  assert.equal(result.actionType, "one-action");
  assert.deepEqual(result.traits, ["attack"]);
  assert.equal(result.requirements, "");
  assert.equal(result.img, "");
  assert.equal(result.rarity, "common");
  assert.equal(Object.hasOwn(result as Record<string, unknown>, "extra"), false);
});

test("ensureValid uses GPT repair when Ajv validation fails", async () => {
  const stub = new StubGPTClient();
  stub.enqueue({
    schema_version: 1,
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
  });

  const payload = {
    schema_version: 1,
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
    schema_version: 1,
    systemId: "pf2e",
    type: "item",
    slug: "broken-item",
    name: "Broken Item",
    itemType: "wand",
    rarity: "legendary",
    level: 1,
  });

  const payload = {
    schema_version: 1,
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

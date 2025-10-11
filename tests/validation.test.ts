import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  ActionSchemaData,
  ActorSchemaData,
  ItemSchemaData,
  PackEntrySchemaData
} from "../src/scripts/schemas";
import { formatError, formatErrorPath, validate } from "../src/scripts/helpers/validation";
import { cloneFixture, loadFixture } from "./helpers/fixtures";

const actionFixture = loadFixture<ActionSchemaData>("action.json");
const itemFixture = loadFixture<ItemSchemaData>("item.json");
const actorFixture = loadFixture<ActorSchemaData>("actor.json");
const packEntryFixture = loadFixture<PackEntrySchemaData>("pack-entry.json");

test("canonical fixtures validate against their schemas", () => {
  const cases: Array<{
    type: "action" | "item" | "actor" | "packEntry";
    fixture: ActionSchemaData | ItemSchemaData | ActorSchemaData | PackEntrySchemaData;
    file: string;
  }> = [
    { type: "action", fixture: actionFixture, file: "tests/fixtures/action.json" },
    { type: "item", fixture: itemFixture, file: "tests/fixtures/item.json" },
    { type: "actor", fixture: actorFixture, file: "tests/fixtures/actor.json" },
    { type: "packEntry", fixture: packEntryFixture, file: "tests/fixtures/pack-entry.json" }
  ];

  for (const { type, fixture, file } of cases) {
    const result = validate(type, cloneFixture(fixture));
    assert.deepStrictEqual(result, { ok: true }, `${file} should conform to the ${type} schema`);
  }
});

test("invalid action enum produces helpful error", () => {
  const result = validate("action", { ...cloneFixture(actionFixture), actionType: "quad-action" as any });
  assert.equal(result.ok, false);
  if (!result.ok) {
    const [error] = result.errors;
    assert.equal(error.instancePath, "/actionType");
    assert.equal(formatErrorPath(error), "actionType");
    assert.equal(formatError(error), "actionType: must be equal to one of the allowed values");
  }
});

test("extra fields are reported for items", () => {
  const result = validate("item", { ...cloneFixture(itemFixture), extra: true } as Record<string, unknown>);
  assert.equal(result.ok, false);
  if (!result.ok) {
    const paths = result.errors.map((error) => formatErrorPath(error));
    assert.ok(paths.includes("extra"), `Unexpected paths: ${paths.join(", ")}`);

    const messages = result.errors.map((error) => formatError(error));
    assert.ok(
      messages.includes("extra: must NOT have additional properties"),
      `Unexpected errors: ${messages.join(", ")}`
    );
  }
});

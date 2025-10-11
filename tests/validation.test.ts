import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  ActionSchemaData,
  ActorSchemaData,
  ItemSchemaData,
  PackEntrySchemaData
} from "../src/scripts/schemas";
import { LATEST_SCHEMA_VERSION } from "../src/scripts/schemas";
import { formatError, formatErrorPath, validate } from "../src/scripts/helpers/validation";
import { cloneFixture, loadFixture } from "./helpers/fixtures";
import { migrate } from "../src/scripts/migrations";

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

test("schemas advertise the latest schema version", () => {
  assert.equal(actionFixture.schema_version, LATEST_SCHEMA_VERSION);
  assert.equal(itemFixture.schema_version, LATEST_SCHEMA_VERSION);
  assert.equal(actorFixture.schema_version, LATEST_SCHEMA_VERSION);
  assert.equal(packEntryFixture.schema_version, LATEST_SCHEMA_VERSION);
});

test("migrate upgrades legacy actions and applies defaults", () => {
  const legacy = { ...cloneFixture(actionFixture), schema_version: 1 } as ActionSchemaData & {
    schema_version: number;
    source?: string;
  };
  delete legacy.source;

  const migrated = migrate("action", 1, LATEST_SCHEMA_VERSION, legacy);

  assert.equal(migrated.schema_version, LATEST_SCHEMA_VERSION);
  assert.equal(migrated.source, "");
  assert.equal(migrated.type, "action");
});

test("legacy fixtures migrate cleanly during validation", () => {
  const cases: Array<{
    type: "action" | "item" | "actor" | "packEntry";
    factory: () => Record<string, unknown>;
    expectSource?: boolean;
  }> = [
    {
      type: "action",
      factory: () => {
        const data = cloneFixture(actionFixture);
        data.schema_version = 1 as any;
        delete (data as { source?: string }).source;
        return data as Record<string, unknown>;
      },
      expectSource: true,
    },
    {
      type: "item",
      factory: () => {
        const data = cloneFixture(itemFixture);
        data.schema_version = 1 as any;
        delete (data as { source?: string }).source;
        return data as Record<string, unknown>;
      },
      expectSource: true,
    },
    {
      type: "actor",
      factory: () => {
        const data = cloneFixture(actorFixture);
        data.schema_version = 1 as any;
        delete (data as { source?: string }).source;
        return data as Record<string, unknown>;
      },
      expectSource: true,
    },
    {
      type: "packEntry",
      factory: () => {
        const data = cloneFixture(packEntryFixture);
        data.schema_version = 1 as any;
        return data as Record<string, unknown>;
      },
    },
  ];

  for (const { type, factory, expectSource } of cases) {
    const legacy = factory();
    const result = validate(type, legacy);
    assert.deepStrictEqual(result, { ok: true }, `${type} should validate after migration`);
    const normalized = legacy as { schema_version: number; source?: string };
    assert.equal(normalized.schema_version, LATEST_SCHEMA_VERSION);
    if (expectSource) {
      assert.equal(normalized.source, "");
    }
  }
});

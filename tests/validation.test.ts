import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  ActionSchemaData,
  ActorSchemaData,
  ItemSchemaData,
  PackEntrySchemaData
} from "../src/scripts/schemas";
import { formatError, formatErrorPath, validate } from "../src/scripts/helpers/validation";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

const validAction: ActionSchemaData = {
  schema_version: 1,
  systemId: "pf2e",
  type: "action",
  slug: "test-action",
  name: "Test Action",
  actionType: "one-action",
  traits: ["attack"],
  description: "You do something impressive.",
  requirements: ""
};

const validItem: ItemSchemaData = {
  schema_version: 1,
  systemId: "pf2e",
  type: "item",
  slug: "test-item",
  name: "Test Item",
  itemType: "equipment",
  rarity: "common",
  level: 1,
  price: 10,
  traits: ["magical"],
  description: "A handy trinket."
};

const validActor: ActorSchemaData = {
  schema_version: 1,
  systemId: "pf2e",
  type: "actor",
  slug: "test-actor",
  name: "Test Actor",
  actorType: "npc",
  rarity: "common",
  level: 3,
  traits: ["humanoid"],
  languages: ["Common"]
};

const validPackEntry: PackEntrySchemaData = {
  schema_version: 1,
  systemId: "pf2e",
  id: "entry-1",
  entityType: "action",
  name: "Test Entry",
  slug: "test-entry"
};

test("valid fixtures pass validation", () => {
  assert.deepStrictEqual(validate("action", clone(validAction)), { ok: true });
  assert.deepStrictEqual(validate("item", clone(validItem)), { ok: true });
  assert.deepStrictEqual(validate("actor", clone(validActor)), { ok: true });
  assert.deepStrictEqual(validate("packEntry", clone(validPackEntry)), { ok: true });
});

test("invalid action enum produces helpful error", () => {
  const result = validate("action", { ...clone(validAction), actionType: "quad-action" as any });
  assert.equal(result.ok, false);
  if (!result.ok) {
    const [error] = result.errors;
    assert.equal(error.instancePath, "/actionType");
    assert.equal(formatErrorPath(error), "actionType");
    assert.equal(formatError(error), "actionType: must be equal to one of the allowed values");
  }
});

test("extra fields are reported for items", () => {
  const result = validate("item", { ...clone(validItem), extra: true } as Record<string, unknown>);
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

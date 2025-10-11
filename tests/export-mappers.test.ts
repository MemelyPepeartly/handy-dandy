import assert from "node:assert/strict";
import { test } from "node:test";
import { fromFoundryAction, fromFoundryActor, fromFoundryItem } from "../src/scripts/mappers/export";
import { toFoundryActionData, toFoundryActorData, toFoundryItemData } from "../src/scripts/mappers/import";
import { validate } from "../src/scripts/helpers/validation";
import type { ActionSchemaData, ActorSchemaData, ItemSchemaData } from "../src/scripts/schemas";
import { cloneFixture, loadFixture } from "./helpers/fixtures";

const actionFixture = loadFixture<ActionSchemaData>("action.json");
const itemFixture = loadFixture<ItemSchemaData>("item.json");
const actorFixture = loadFixture<ActorSchemaData>("actor.json");

test("action fixture survives a Foundry round-trip", () => {
  const foundry = toFoundryActionData(cloneFixture(actionFixture));
  const canonical = fromFoundryAction(foundry);

  assert.deepStrictEqual(
    canonical,
    actionFixture,
    "tests/fixtures/action.json should round-trip through Foundry mappers",
  );
});

test("item fixture survives a Foundry round-trip", () => {
  const foundry = toFoundryItemData(cloneFixture(itemFixture));
  const canonical = fromFoundryItem(foundry);

  assert.deepStrictEqual(
    canonical,
    itemFixture,
    "tests/fixtures/item.json should round-trip through Foundry mappers",
  );
});

test("actor fixture survives a Foundry round-trip", () => {
  const foundry = toFoundryActorData(cloneFixture(actorFixture));
  const canonical = fromFoundryActor(foundry);

  assert.deepStrictEqual(
    canonical,
    actorFixture,
    "tests/fixtures/actor.json should round-trip through Foundry mappers",
  );
});

test("fromFoundryAction produces a valid schema-compliant action", () => {
  const mockAction = {
    name: "Power Attack",
    type: "action",
    img: "systems/pf2e/icons/default-icons/action.svg",
    system: {
      slug: "power-attack",
      description: { value: "<p><strong>Strike</strong> twice.</p>" },
      traits: { value: ["attack ", " fighter"], rarity: "common" },
      actionType: { value: "one" },
      requirements: { value: "Wield a melee weapon. " },
      source: { value: "Advanced Player's Guide" }
    }
  };

  const action = fromFoundryAction(mockAction);
  assert.equal(action.schema_version, 2);
  assert.equal(action.systemId, "pf2e");
  assert.equal(action.slug, "power-attack");
  assert.equal(action.actionType, "one-action");
  assert.deepEqual(action.traits, ["attack", "fighter"]);
  assert.equal(action.requirements, "Wield a melee weapon.");
  assert.equal(action.description, "Strike twice.");
  assert.equal(action.rarity, "common");
  assert.equal(action.source, "Advanced Player's Guide");
  assert.ok(!("img" in action), "placeholder icon should be removed");

  const validation = validate("action", action);
  assert.deepEqual(validation, { ok: true });
});

test("fromFoundryItem normalises PF2e specific fields", () => {
  const mockItem = {
    name: "Resonant Blade",
    type: "weapon",
    img: "systems/pf2e/icons/default-icons/weapon.svg",
    system: {
      description: { value: "<p>Shiny <em>blade</em>.</p>" },
      level: { value: 2 },
      traits: { value: ["magical", " versatile-s "], rarity: "uncommon" },
      price: { value: { gp: 12, sp: 5 } },
      source: { value: "Guns & Gears" }
    }
  };

  const item = fromFoundryItem(mockItem);
  assert.equal(item.schema_version, 2);
  assert.equal(item.systemId, "pf2e");
  assert.equal(item.slug, "resonant-blade");
  assert.equal(item.itemType, "weapon");
  assert.equal(item.rarity, "uncommon");
  assert.equal(item.level, 2);
  assert.equal(item.price, 12.5);
  assert.deepEqual(item.traits, ["magical", "versatile-s"]);
  assert.equal(item.description, "Shiny blade.");
  assert.equal(item.source, "Guns & Gears");
  assert.ok(!("img" in item));

  const validation = validate("item", item);
  assert.deepEqual(validation, { ok: true });
});

test("fromFoundryActor converts actor documents", () => {
  const mockActor = {
    name: "Goblin Warrior",
    type: "npc",
    img: "icons/svg/mystery-man.svg",
    system: {
      slug: "goblin-warrior",
      details: {
        level: { value: 3 },
        languages: { value: "Goblin, Common" },
        source: { value: "Bestiary" }
      },
      traits: {
        rarity: "common",
        value: ["goblin", " humanoid "],
        languages: { value: ["Goblin", " Goblin Sign"] }
      }
    }
  };

  const actor = fromFoundryActor(mockActor);
  assert.equal(actor.schema_version, 3);
  assert.equal(actor.systemId, "pf2e");
  assert.equal(actor.slug, "goblin-warrior");
  assert.equal(actor.actorType, "npc");
  assert.equal(actor.rarity, "common");
  assert.equal(actor.level, 3);
  assert.equal(actor.size, "med");
  assert.deepEqual(actor.traits, ["goblin", "humanoid"]);
  assert.deepEqual(actor.languages, ["Goblin", "Goblin Sign", "Common"]);
  assert.equal(actor.source, "Bestiary");
  assert.equal(actor.img, null);
  assert.equal(actor.attributes.hp.value, 1);
  assert.equal(actor.abilities.str, 0);
  assert.deepEqual(actor.skills, []);
  assert.deepEqual(actor.strikes, []);
  assert.deepEqual(actor.actions, []);

  const validation = validate("actor", actor);
  assert.deepEqual(validation, { ok: true });
});

import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { importAction, importActor, importItem, toFoundryActionData, toFoundryActorData, toFoundryItemData } from "../src/scripts/mappers/import";
import type { ActionSchemaData, ActorGenerationResult, ActorSchemaData, ItemSchemaData } from "../src/scripts/schemas";
import { cloneFixture, loadFixture } from "./helpers/fixtures";

class MockItem {
  public static nextId = 1;
  public static created: MockItem[] = [];

  public id: string;
  public name: string;
  public type: string;
  public img: string;
  public system: any;
  public folder: string | null | undefined;

  constructor(source: any) {
    this.id = source._id ?? `MockItem.${MockItem.nextId++}`;
    this.name = source.name;
    this.type = source.type;
    this.img = source.img;
    this.system = JSON.parse(JSON.stringify(source.system ?? {}));
    this.folder = source.folder ?? null;
    MockItem.created.push(this);
  }

  static async create(source: any, _options?: any): Promise<MockItem> {
    return new MockItem(source);
  }

  async update(changes: any): Promise<this> {
    if (changes.name) this.name = changes.name;
    if (changes.type) this.type = changes.type;
    if (changes.img) this.img = changes.img;
    if (changes.folder !== undefined) this.folder = changes.folder;
    if (changes.system) {
      this.system = JSON.parse(JSON.stringify(changes.system));
    }
    return this;
  }
}

class MockPack {
  public index: any[] = [];
  private documents = new Map<string, MockItem>();

  constructor(public collection: string) {}

  async importDocument(source: any, _options?: any): Promise<MockItem> {
    const document = new MockItem(source);
    this.documents.set(document.id, document);
    this.index.push({ _id: document.id, name: document.name, slug: document.system?.slug });
    return document;
  }

  async getDocument(id: string): Promise<MockItem | undefined> {
    return this.documents.get(id);
  }

  addDocument(doc: MockItem): void {
    this.documents.set(doc.id, doc);
    this.index.push({ _id: doc.id, name: doc.name, slug: doc.system?.slug });
  }
}

class MockCollection<T extends { id: string }> extends Map<string, T> {
  get contents(): T[] {
    return Array.from(this.values());
  }

  find(predicate: (value: T) => boolean): T | undefined {
    for (const value of this.values()) {
      if (predicate(value)) return value;
    }
    return undefined;
  }
}

class MockActor {
  public static nextId = 1;
  public static created: MockActor[] = [];

  public id: string;
  public name: string;
  public type: string;
  public img: string;
  public system: any;
  public prototypeToken: any;
  public items: any[];
  public effects: unknown[];
  public folder: string | null;
  public flags: Record<string, unknown>;

  constructor(source: any) {
    this.id = source._id ?? `MockActor.${MockActor.nextId++}`;
    this.name = source.name;
    this.type = source.type;
    this.img = source.img;
    this.system = JSON.parse(JSON.stringify(source.system ?? {}));
    this.prototypeToken = JSON.parse(JSON.stringify(source.prototypeToken ?? {}));
    this.items = JSON.parse(JSON.stringify(source.items ?? []));
    this.effects = JSON.parse(JSON.stringify(source.effects ?? []));
    this.folder = source.folder ?? null;
    this.flags = JSON.parse(JSON.stringify(source.flags ?? {}));
    MockActor.created.push(this);
  }

  static async create(source: any, _options?: any): Promise<MockActor> {
    return new MockActor(source);
  }

  async update(changes: any): Promise<this> {
    if (changes.name) this.name = changes.name;
    if (changes.type) this.type = changes.type;
    if (changes.img) this.img = changes.img;
    if (changes.folder !== undefined) this.folder = changes.folder;
    if (changes.system) this.system = JSON.parse(JSON.stringify(changes.system));
    if (changes.prototypeToken) this.prototypeToken = JSON.parse(JSON.stringify(changes.prototypeToken));
    if (Array.isArray(changes.effects)) this.effects = JSON.parse(JSON.stringify(changes.effects));
    if (Array.isArray(changes.items)) this.items = JSON.parse(JSON.stringify(changes.items));
    if (changes.flags) this.flags = JSON.parse(JSON.stringify(changes.flags));
    return this;
  }
}

const actionFixture = loadFixture<ActionSchemaData>("action.json");
const createAction = (): ActionSchemaData => cloneFixture(actionFixture);
const itemFixture = loadFixture<ItemSchemaData>("item.json");
const createItem = (): ItemSchemaData => cloneFixture(itemFixture);
const actorFixture = loadFixture<ActorSchemaData>("actor.json");
const createActor = (): ActorSchemaData => cloneFixture(actorFixture);

beforeEach(() => {
  MockItem.nextId = 1;
  MockItem.created = [];
  MockActor.nextId = 1;
  MockActor.created = [];
  const packs = new Map<string, MockPack>();
  const items = new MockCollection<MockItem>();
  const actors = new MockCollection<MockActor>();

  (globalThis as any).game = {
    packs,
    items,
    actors,
    user: { isGM: true },
    system: { id: "pf2e" }
  } satisfies Partial<Game>;

  (globalThis as any).CONFIG = {
    PF2E: {
      actionTraits: {
        fire: "Fire",
        magical: "Magical",
      },
      immunityTypes: {
        fire: "Fire",
        water: "Water",
        custom: "",
      },
      weaknessTypes: {
        water: "Water",
        "salt-water": "Salt Water",
        bludgeoning: "Bludgeoning",
        custom: "",
      },
      resistanceTypes: {
        bludgeoning: "Bludgeoning",
        water: "Water",
        custom: "",
      },
    },
  } satisfies Partial<typeof CONFIG>;

  Object.defineProperty(globalThis, "Item", {
    configurable: true,
    value: MockItem
  });

  Object.defineProperty(globalThis, "Actor", {
    configurable: true,
    value: MockActor
  });
});

test("toFoundryActionData converts canonical JSON into PF2e action data", () => {
  const action = createAction();
  const glyphAction = {
    ...action,
    description: action.description.replace("r is triggered", "[reaction] is triggered"),
  } satisfies ActionSchemaData;
  const data = toFoundryActionData(glyphAction);

  assert.equal(data.name, "Stunning Strike");
  assert.equal(data.type, "action");
  assert.equal(data.system.slug, "stunning-strike");
  assert.equal(data.system.traits.rarity, "uncommon");
  assert.deepEqual(data.system.traits.value, ["fighter", "press"]);
  assert.equal(data.system.actionType.value, "two");
  assert.equal(data.system.actions.value, 2);
  assert.match(
    data.system.description.value,
    /<p>Deliver a crushing blow\.<\/p><ul><li>On a success, <span class="pf2-icon">r<\/span> is triggered\.<\/li><li>On a critical success, the target is knocked @UUID\[Compendium\.pf2e\.conditionitems\.Item\.j91X7x0XSomq8d60\]\{Prone\}\.<\/li><\/ul>/,
  );
  assert.equal(data.system.requirements.value, "<p>Wield a melee weapon.<\/p>");
  assert.equal(data.system.source.value, "Pathfinder Core Rulebook");
});

test("importAction updates an existing compendium entry with the same slug", async () => {
  const pack = new MockPack("pf2e.actions");
  const existing = new MockItem({
    name: "Old Action",
    type: "action",
    img: "old.png",
    system: { slug: "stunning-strike", description: { value: "<p>Old</p>" }, traits: { value: [], rarity: "common" }, actionType: { value: "one" }, actions: { value: 1 }, requirements: { value: "" }, source: { value: "" }, rules: [] }
  });
  pack.addDocument(existing);
  (game.packs as Map<string, MockPack>).set("pf2e.actions", pack);

  const result = await importAction(createAction(), { packId: "pf2e.actions", folderId: "folder-123" });

  assert.strictEqual(result, existing);
  assert.equal(existing.folder, "folder-123");
  assert.equal(existing.system.description.value, toFoundryActionData(createAction()).system.description.value);
});

test("importAction creates a new compendium entry when none exists", async () => {
  const pack = new MockPack("pf2e.actions");
  (game.packs as Map<string, MockPack>).set("pf2e.actions", pack);

  const result = await importAction(createAction(), { packId: "pf2e.actions" });

  assert.equal(result.name, "Stunning Strike");
  assert.equal(pack.index.length, 1);
  assert.equal(result.system.slug, "stunning-strike");
});

test("importAction updates a world item when one with the slug is present", async () => {
  const existing = new MockItem({
    name: "Old Action",
    type: "action",
    img: "old.png",
    system: { slug: "stunning-strike", description: { value: "<p>Old</p>" }, traits: { value: [], rarity: "common" }, actionType: { value: "one" }, actions: { value: 1 }, requirements: { value: "" }, source: { value: "" }, rules: [] }
  });

  (game.items as MockCollection<MockItem>).set(existing.id, existing);

  const result = await importAction(createAction(), { folderId: "folder-999" });

  assert.strictEqual(result, existing);
  assert.equal(existing.folder, "folder-999");
  assert.equal(existing.system.traits.rarity, "uncommon");
});

test("importAction creates a new world item when no match is found", async () => {
  const result = await importAction(createAction());
  assert.equal(result.name, "Stunning Strike");
  assert.equal(MockItem.created.length, 1);
});

test("toFoundryItemData always includes normalized quantity, usage, bulk, size, and price values", () => {
  const item = createItem();
  item.itemType = "equipment";
  item.price = 12.34;

  const source = toFoundryItemData(item);

  assert.equal(source.system.quantity, 1);
  assert.deepEqual(source.system.usage, { value: "held-in-one-hand" });
  assert.deepEqual(source.system.bulk, { value: 0 });
  assert.equal(source.system.size, "med");
  assert.deepEqual(source.system.price.value, { pp: 1, gp: 2, sp: 3, cp: 4 });
});

test("importItem can target and update a specific world item by itemId", async () => {
  const existing = new MockItem({
    name: "Old Item",
    type: "equipment",
    img: "old.png",
    system: { slug: "old-item", description: { value: "<p>Old</p>" }, traits: { value: [], rarity: "common" } },
  });
  (game.items as MockCollection<MockItem>).set(existing.id, existing);

  const payload = {
    ...createItem(),
    slug: "new-generated-item",
    name: "Remixed Item",
  } satisfies ItemSchemaData;

  const result = await importItem(payload, { itemId: existing.id });

  assert.strictEqual(result, existing);
  assert.equal(existing.name, "Remixed Item");
  assert.equal(existing.system.slug, "new-generated-item");
});

test("toFoundryActorData filters action traits and normalizes frequency", () => {
  const actor = createActor();
  actor.actions = [
    {
      name: "Fiery Breath",
      actionCost: "two-actions",
      description: "Breathes fire.",
      traits: ["fire", "evocation", "magical"],
      requirements: null,
      trigger: null,
      frequency: "once per minute",
    },
  ];

  const result = toFoundryActorData(actor);
  const actionItem = result.items.find((item) => item.type === "action" && item.name === "Fiery Breath");

  assert.ok(actionItem, "expected Fiery Breath action to be generated");
  assert.deepEqual(actionItem!.system.traits.value, ["fire", "magical"]);
  assert.deepEqual(actionItem!.system.traits.otherTags, ["evocation"]);
  assert.deepEqual(actionItem!.system.frequency, { value: 1, max: 1, per: "PT1M" });
});

test("toFoundryActorData routes strike HTML and UUID effect text into description", () => {
  const actor = createActor();
  actor.strikes = [
    {
      name: "Spark Lash",
      type: "melee",
      attackBonus: 12,
      traits: ["agile", "magical"],
      damage: [{ formula: "2d8+6", damageType: "electricity", notes: null }],
      effects: [
        "(plus on a hit, target must attempt a reflex save or be dazzled 1)",
        "@UUID[Compendium.pf2e.conditionitems.Item.Dazzled]{Dazzled}",
        "<p>The creature lashes with crackling static.</p>",
      ],
      description: "<p>Primary strike description.</p>",
    },
  ];

  const result = toFoundryActorData(actor);
  const strike = result.items.find((item) => item.type === "melee" && item.name === "Spark Lash");

  assert.ok(strike, "expected generated strike item");
  assert.deepEqual(strike!.system.attackEffects.value, []);
  assert.equal(
    strike!.system.description.value,
    "<p>Primary strike description.</p><p>(plus on a hit, target must attempt a reflex save or be @UUID[Compendium.pf2e.conditionitems.Item.TkIyaNPgTZFBCCuh]{Dazzled 1})</p><p>@UUID[Compendium.pf2e.conditionitems.Item.TkIyaNPgTZFBCCuh]{Dazzled}</p><p>The creature lashes with crackling static.</p>",
  );
});

test("toFoundryActorData normalizes lowercase UUID macros inside HTML descriptions", () => {
  const actor = createActor();
  actor.strikes = [
    {
      name: "Shimmer Blade",
      type: "melee",
      attackBonus: 10,
      traits: ["magical"],
      damage: [{ formula: "1d8+4", damageType: "slashing", notes: null }],
      effects: [],
      description: "<p>On hit, target is @uuid[compendium.pf2e.conditionitems.item.dazzled]{dazzled}.</p>",
    },
  ];

  const result = toFoundryActorData(actor);
  const strike = result.items.find((item) => item.type === "melee" && item.name === "Shimmer Blade");

  assert.ok(strike, "expected generated strike item");
  assert.equal(strike!.system.description.value.includes("@uuid["), false);
  assert.equal(strike!.system.description.value.includes("@UUID["), true);
  assert.equal(
    strike!.system.description.value.includes("@UUID[Compendium.pf2e.conditionitems.Item.TkIyaNPgTZFBCCuh]{dazzled}"),
    true,
  );
});

test("toFoundryActorData canonicalizes condition UUIDs that use condition names instead of IDs", () => {
  const actor = createActor();
  actor.strikes = [
    {
      name: "Rattle Fang",
      type: "melee",
      attackBonus: 11,
      traits: ["magical"],
      damage: [{ formula: "1d10+4", damageType: "piercing", notes: null }],
      effects: [],
      description:
        "<p>On hit, target becomes @UUID[Compendium.pf2e.conditionitems.Item.Frightened]{Frightened 1}.</p>",
    },
  ];

  const result = toFoundryActorData(actor);
  const strike = result.items.find((item) => item.type === "melee" && item.name === "Rattle Fang");

  assert.ok(strike, "expected generated strike item");
  assert.equal(
    strike!.system.description.value.includes("@UUID[Compendium.pf2e.conditionitems.Item.TBSHQspnbcqxsmjL]{Frightened 1}"),
    true,
  );
  assert.equal(strike!.system.description.value.includes(".Item.Frightened]"), false);
});

test("toFoundryActorData converts markdown emphasis inside HTML action descriptions", () => {
  const actor = createActor();
  actor.actions = [
    {
      name: "Cinematic Rant",
      actionCost: "one-action",
      description: "<p>**Requirements** The creature must be heard.</p><p>**Frequency** once per 10 minutes</p>",
      traits: ["auditory"],
      requirements: null,
      trigger: null,
      frequency: null,
    },
  ];

  const result = toFoundryActorData(actor);
  const action = result.items.find((item) => item.type === "action" && item.name === "Cinematic Rant");

  assert.ok(action, "expected generated action item");
  assert.equal(action!.system.description.value.includes("**Requirements**"), false);
  assert.equal(action!.system.description.value.includes("<strong>Requirements</strong>"), true);
  assert.equal(action!.system.description.value.includes("<strong>Frequency</strong>"), true);
});

test("toFoundryActorData maps loot actors to loot-sheet structure", () => {
  const actor = createActor();
  actor.actorType = "loot";
  actor.level = 3;
  actor.description = "A communal vault stash.";
  actor.strikes = [];
  actor.actions = [];
  actor.spellcasting = [];
  actor.loot = {
    lootSheetType: "Merchant",
    hiddenWhenEmpty: true,
  };
  actor.inventory = [
    {
      name: "Healing Potion",
      itemType: "consumable",
      quantity: 2,
      level: 1,
      description: "A restorative draft.",
      img: null,
    },
    {
      name: "Spell Ledger",
      itemType: "spell",
      quantity: 1,
      level: 3,
      description: "A copied spellbook page.",
      img: null,
    },
  ];

  const result = toFoundryActorData(actor);
  const system = result.system as Record<string, any>;

  assert.equal(result.type, "loot");
  assert.equal(system.lootSheetType, "Merchant");
  assert.equal(system.hiddenWhenEmpty, true);
  assert.equal(system.details.level.value, 3);
  assert.equal(result.items.length, 2);
  assert.equal(result.items.some((item) => item.type === "spell" || item.type === "feat"), false);
  const barAttribute = (result.prototypeToken as { bar1?: { attribute?: unknown } }).bar1?.attribute;
  assert.equal(barAttribute, null);
});

test("toFoundryActorData maps hazards with hazard metadata and macro-ready text", () => {
  const actor = createActor();
  actor.actorType = "hazard";
  actor.level = 7;
  actor.traits = ["magical"];
  actor.inventory = [];
  actor.spellcasting = [];
  actor.hazard = {
    isComplex: true,
    disable: "Thievery DC 26 to jam the gears.",
    routine: "Each round, spinning blades deal 2d8 slashing damage (Reflex DC 24).",
    reset: "Resets after 1 hour.",
    emitsSound: "encounter",
    hardness: 8,
    stealthBonus: 14,
    stealthDetails: "Visible to a trained eye.",
  };
  actor.actions = [
    {
      name: "Blade Burst",
      actionCost: "reaction",
      description: "Trigger A creature enters the corridor. Effect 2d8 slashing damage; Reflex DC 24.",
      traits: ["fire"],
      requirements: null,
      trigger: null,
      frequency: null,
    },
  ];
  actor.strikes = [
    {
      name: "Spinning Blade",
      type: "melee",
      attackBonus: 15,
      traits: ["agile"],
      damage: [{ formula: "2d8", damageType: "slashing", notes: null }],
      effects: [],
      description: null,
    },
  ];

  const result = toFoundryActorData(actor);
  const system = result.system as Record<string, any>;

  assert.equal(result.type, "hazard");
  assert.equal(system.details.isComplex, true);
  assert.equal(system.attributes.hardness, 8);
  assert.equal(system.attributes.stealth.value, 14);
  assert.equal(system.attributes.emitsSound, "encounter");
  assert.match(String(system.details.disable), /@Check\[thievery\|dc:26\]/i);

  const action = result.items.find((item) => item.type === "action" && item.name === "Blade Burst");
  assert.ok(action, "expected generated hazard action");
  assert.match(String((action as any).system.description.value), /@Damage\[/i);
  assert.match(String((action as any).system.description.value), /@Check\[reflex\|dc:24\]/i);
});

test("toFoundryActorData links condition-style strike effects in descriptions", () => {
  const actor = createActor();
  actor.strikes = [
    {
      name: "Grasping Tendril",
      type: "melee",
      attackBonus: 12,
      traits: ["magical"],
      damage: [{ formula: "2d6+6", damageType: "bludgeoning", notes: null }],
      effects: ["off-guard", "dazzled"],
      description: null,
    },
  ];

  const result = toFoundryActorData(actor);
  const strike = result.items.find((item) => item.type === "melee" && item.name === "Grasping Tendril");

  assert.ok(strike, "expected generated strike item");
  assert.deepEqual(strike!.system.attackEffects.value, []);
  assert.match(strike!.system.description.value, /@UUID\[Compendium\.pf2e\.conditionitems\.Item\.AJh5ex99aV6VTggg\]\{Off-Guard\}/);
  assert.match(strike!.system.description.value, /@UUID\[Compendium\.pf2e\.conditionitems\.Item\.TkIyaNPgTZFBCCuh\]\{Dazzled\}/);
});

test("toFoundryActorData keeps only PF2E-known strike attack effect slugs as attack effects", () => {
  const actor = createActor();
  actor.strikes = [
    {
      name: "Crusher Tail",
      type: "melee",
      attackBonus: 15,
      traits: ["magical"],
      damage: [{ formula: "2d12+8", damageType: "bludgeoning", notes: null }],
      effects: ["grab", "homebrew-stagger"],
      description: null,
    },
  ];

  const result = toFoundryActorData(actor);
  const strike = result.items.find((item) => item.type === "melee" && item.name === "Crusher Tail");

  assert.ok(strike, "expected generated strike item");
  assert.deepEqual(strike!.system.attackEffects.value, ["grab"]);
  assert.match(strike!.system.description.value, /<p>homebrew-stagger<\/p>/);
});

test("toFoundryActorData links staged condition effects in strike descriptions without unknown attack effects", () => {
  const actor = createActor();
  actor.strikes = [
    {
      name: "Mind Spike",
      type: "melee",
      attackBonus: 14,
      traits: ["magical"],
      damage: [{ formula: "2d8+5", damageType: "mental", notes: null }],
      effects: ["frightened 1", "stupefied 2"],
      description: null,
    },
  ];

  const result = toFoundryActorData(actor);
  const strike = result.items.find((item) => item.type === "melee" && item.name === "Mind Spike");

  assert.ok(strike, "expected generated strike item");
  assert.deepEqual(strike!.system.attackEffects.value, []);
  assert.match(strike!.system.description.value, /@UUID\[Compendium\.pf2e\.conditionitems\.Item\.TBSHQspnbcqxsmjL\]\{Frightened 1\}/);
  assert.match(strike!.system.description.value, /@UUID\[Compendium\.pf2e\.conditionitems\.Item\.e1XGnhKNSQIm5IXg\]\{Stupefied 2\}/);
});

test("toFoundryActorData applies fallback images to custom inventory items", () => {
  const actor = createActor();
  actor.inventory = [
    {
      name: "Prototype Gizmo",
      itemType: "equipment",
      quantity: 1,
      level: 2,
      description: "Experimental gear.",
      img: null,
    },
  ];

  const result = toFoundryActorData(actor);
  const inventoryItem = result.items.find((item) => item.name === "Prototype Gizmo");

  assert.ok(inventoryItem, "expected custom inventory item");
  assert.equal(inventoryItem!.img, "systems/pf2e/icons/default-icons/equipment.svg");
});

test("toFoundryActorData normalizes placeholder inventory icons to PF2E category defaults", () => {
  const actor = createActor();
  actor.inventory = [
    {
      name: "Flash Bomb",
      itemType: "consumable",
      quantity: 2,
      level: 3,
      description: "A bright explosive bomb.",
      img: "icons/svg/item-bag.svg",
    },
  ];

  const result = toFoundryActorData(actor);
  const inventoryItem = result.items.find((item) => item.name === "Flash Bomb");

  assert.ok(inventoryItem, "expected custom inventory item");
  assert.equal(inventoryItem!.img, "systems/pf2e/icons/default-icons/consumable.svg");
});

test("toFoundryActorData infers inventory item category from text when itemType is missing", () => {
  const actor = createActor();
  actor.inventory = [
    {
      name: "Rune Longsword",
      itemType: null,
      quantity: 1,
      level: 5,
      description: "A weapon etched with runes.",
      img: "https://example.com/rune-longsword.png",
    },
  ];

  const result = toFoundryActorData(actor);
  const inventoryItem = result.items.find((item) => item.name === "Rune Longsword");

  assert.ok(inventoryItem, "expected custom inventory item");
  assert.equal(inventoryItem!.type, "weapon");
  assert.equal(inventoryItem!.img, "systems/pf2e/icons/default-icons/weapon.svg");
});

test("toFoundryActorData maps wand inventory entries to consumable item documents", () => {
  const actor = createActor();
  actor.inventory = [
    {
      name: "Storm Wand",
      itemType: "wand",
      quantity: 1,
      level: 7,
      description: "Crackling magical wand.",
      img: null,
    },
  ];

  const result = toFoundryActorData(actor);
  const wand = result.items.find((item) => item.name === "Storm Wand");

  assert.ok(wand, "expected custom wand inventory item");
  assert.equal(wand!.type, "consumable");
  assert.equal(wand!.img, "systems/pf2e/icons/default-icons/wand.svg");
  assert.equal((wand!.system as Record<string, unknown>).category, "wand");
});

test("toFoundryActorData maps staff inventory entries to weapon item documents", () => {
  const actor = createActor();
  actor.inventory = [
    {
      name: "Frost Staff",
      itemType: "staff",
      quantity: 1,
      level: 9,
      description: "A staff suffused with winter magic.",
      img: null,
    },
  ];

  const result = toFoundryActorData(actor);
  const staff = result.items.find((item) => item.name === "Frost Staff");

  assert.ok(staff, "expected custom staff inventory item");
  assert.equal(staff!.type, "weapon");
  assert.equal(staff!.img, "systems/pf2e/icons/default-icons/staff.svg");
});

test("importActor sanitizes malformed melee attack effects in generated actor payloads", async () => {
  const actor = createActor();
  actor.slug = "malformed-effects-test";
  actor.name = "Malformed Effects Test";
  actor.strikes = [
    {
      name: "Corrupting Swipe",
      type: "melee",
      attackBonus: 13,
      traits: ["agile"],
      damage: [{ formula: "2d8+5", damageType: "negative", notes: null }],
      effects: ["grab"],
      description: "<p>A warped strike with unstable aftereffects.</p>",
    },
  ];
  actor.actions = [];
  actor.spellcasting = null;
  actor.inventory = null;

  const foundry = toFoundryActorData(actor);
  const strike = foundry.items.find((item) => item.type === "melee" && item.name === "Corrupting Swipe");
  assert.ok(strike, "expected generated strike item");

  (strike!.system.attackEffects as { value: unknown[] }).value = [
    null,
    "grab",
    { label: "Frightened 1" },
    "homebrew-stagger",
  ];

  const generated: ActorGenerationResult = {
    schema_version: actor.schema_version,
    systemId: actor.systemId,
    slug: actor.slug,
    name: foundry.name,
    type: foundry.type as ActorGenerationResult["type"],
    img: foundry.img,
    system: foundry.system as Record<string, unknown>,
    prototypeToken: foundry.prototypeToken as Record<string, unknown>,
    items: foundry.items as Record<string, unknown>[],
    effects: foundry.effects,
    folder: foundry.folder ?? null,
    flags: foundry.flags ?? {},
  };

  const imported = await importActor(generated);
  const importedStrike = (imported as unknown as MockActor).items.find(
    (item: any) => item.type === "melee" && item.name === "Corrupting Swipe",
  );

  assert.ok(importedStrike, "expected imported strike item");
  assert.deepEqual(importedStrike.system.attackEffects.value, ["grab"]);
  assert.match(importedStrike.system.description.value, /Frightened 1/);
  assert.match(importedStrike.system.description.value, /homebrew-stagger/);
});

test("importActor sanitizes unknown IWR exception slugs in generated actor payloads", async () => {
  const actor = createActor();
  actor.slug = "iwr-sanitization-test";
  actor.name = "IWR Sanitization Test";
  actor.attributes.weaknesses = [
    {
      type: "water",
      value: 15,
      exceptions: ["seawater", "saltwater"],
      details: "Seawater saps this creature's power.",
    },
  ];
  actor.attributes.immunities = null;
  actor.attributes.resistances = null;
  actor.actions = [];
  actor.spellcasting = null;
  actor.inventory = null;

  const foundry = toFoundryActorData(actor);
  const weaknesses = (
    (foundry.system as { attributes?: { weaknesses?: unknown[] } }).attributes?.weaknesses ?? []
  ) as Array<Record<string, unknown>>;
  assert.ok(weaknesses.length > 0, "expected weakness entry");

  weaknesses[0].exceptions = ["seawater", "saltwater", null];

  const generated: ActorGenerationResult = {
    schema_version: actor.schema_version,
    systemId: actor.systemId,
    slug: actor.slug,
    name: foundry.name,
    type: foundry.type as ActorGenerationResult["type"],
    img: foundry.img,
    system: foundry.system as Record<string, unknown>,
    prototypeToken: foundry.prototypeToken as Record<string, unknown>,
    items: foundry.items as Record<string, unknown>[],
    effects: foundry.effects,
    folder: foundry.folder ?? null,
    flags: foundry.flags ?? {},
  };

  const imported = await importActor(generated);
  const importedWeaknesses = (
    (imported as unknown as MockActor).system as { attributes?: { weaknesses?: unknown[] } }
  ).attributes?.weaknesses as Array<Record<string, unknown>>;

  assert.ok(Array.isArray(importedWeaknesses), "expected imported weaknesses array");
  assert.ok(importedWeaknesses.length > 0, "expected imported weakness");
  assert.deepEqual(importedWeaknesses[0].exceptions, ["salt-water"]);
});

test("importAction rejects payloads for the wrong system", async () => {
  (game as Game).system = { id: "sf2e" } as any;
  await assert.rejects(() => importAction(createAction()), /System ID mismatch/);
});

test("importAction throws when the JSON payload is invalid", async () => {
  await assert.rejects(
    () =>
      importAction({
        ...createAction(),
        description: ""
      }),
    /Action JSON failed validation/
  );
});

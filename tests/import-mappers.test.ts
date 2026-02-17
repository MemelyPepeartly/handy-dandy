import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { importAction, toFoundryActionData, toFoundryActorData } from "../src/scripts/mappers/import";
import type { ActionSchemaData, ActorSchemaData } from "../src/scripts/schemas";
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

const actionFixture = loadFixture<ActionSchemaData>("action.json");
const createAction = (): ActionSchemaData => cloneFixture(actionFixture);
const actorFixture = loadFixture<ActorSchemaData>("actor.json");
const createActor = (): ActorSchemaData => cloneFixture(actorFixture);

beforeEach(() => {
  MockItem.nextId = 1;
  MockItem.created = [];
  const packs = new Map<string, MockPack>();
  const items = new MockCollection<MockItem>();

  (globalThis as any).game = {
    packs,
    items,
    user: { isGM: true },
    system: { id: "pf2e" }
  } satisfies Partial<Game>;

  (globalThis as any).CONFIG = {
    PF2E: {
      actionTraits: {
        fire: "Fire",
        magical: "Magical",
      },
    },
  } satisfies Partial<typeof CONFIG>;

  Object.defineProperty(globalThis, "Item", {
    configurable: true,
    value: MockItem
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
    /<p>Deliver a crushing blow\.<\/p><ul><li>On a success, <span class="pf2-icon">r<\/span> is triggered\.<\/li><li>On a critical success, the target is knocked @UUID\[Compendium\.pf2e\.conditionitems\.Item\.Prone\]\{Prone\}\.<\/li><\/ul>/,
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
  assert.deepEqual(strike!.system.attackEffects.value, ["(plus on a hit, target must attempt a reflex save or be dazzled 1)"]);
  assert.equal(
    strike!.system.description.value,
    "<p>Primary strike description.</p><p>@UUID[Compendium.pf2e.conditionitems.Item.Dazzled]{Dazzled}</p><p>The creature lashes with crackling static.</p>",
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
  assert.deepEqual(strike!.system.attackEffects.value, ["off-guard", "dazzled"]);
  assert.match(strike!.system.description.value, /@UUID\[Compendium\.pf2e\.conditionitems\.Item\.Off-Guard\]\{Off-Guard\}/);
  assert.match(strike!.system.description.value, /@UUID\[Compendium\.pf2e\.conditionitems\.Item\.Dazzled\]\{Dazzled\}/);
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

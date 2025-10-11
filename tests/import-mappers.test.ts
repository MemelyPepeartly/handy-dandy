import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { importAction, toFoundryActionData } from "../src/scripts/mappers/import";
import type { ActionSchemaData } from "../src/scripts/schemas";
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
    /<p>Deliver a crushing blow\.<\/p><ul><li>On a success, <span class="pf2-icon">r<\/span> is triggered\.<\/li><li>On a critical success, the target is knocked prone\.<\/li><\/ul>/,
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

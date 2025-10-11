import type { ActionSchemaData, ActorSchemaData, ItemSchemaData, SystemId } from "../schemas";
import { validate, formatError } from "../helpers/validation";

const DEFAULT_ACTION_IMAGE = "systems/pf2e/icons/default-icons/action.svg" as const;
const DEFAULT_ITEM_IMAGE = "systems/pf2e/icons/default-icons/item.svg" as const;
const DEFAULT_ACTOR_IMAGE = "systems/pf2e/icons/default-icons/monster.svg" as const;
const DEFAULT_STRIKE_IMAGE = "systems/pf2e/icons/default-icons/melee.svg" as const;

type ActorSpellcastingEntry = NonNullable<ActorSchemaData["spellcasting"]>[number];

const ACTION_TYPE_MAP: Record<ActionSchemaData["actionType"], { value: string; count: number | null }> = {
  "one-action": { value: "one", count: 1 },
  "two-actions": { value: "two", count: 2 },
  "three-actions": { value: "three", count: 3 },
  free: { value: "free", count: null },
  reaction: { value: "reaction", count: null }
};

const GLYPH_MAP: Record<string, string> = {
  "one-action": "1",
  "two-actions": "2",
  "three-actions": "3",
  reaction: "r",
  "free-action": "f",
  free: "f"
};

function generateId(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = typeof globalThis.crypto?.getRandomValues === "function" ? new Uint32Array(16) : undefined;
  if (bytes) {
    globalThis.crypto.getRandomValues(bytes);
    let id = "";
    for (const byte of bytes) {
      id += alphabet[byte % alphabet.length];
    }
    return id;
  }
  let id = "";
  for (let index = 0; index < 16; index += 1) {
    const random = Math.floor(Math.random() * alphabet.length);
    id += alphabet[random];
  }
  return id;
}

interface PackIndexEntry {
  _id?: string;
  id?: string;
  name?: string;
  slug?: string | null;
  system?: { slug?: string | null };
}

export type ImportOptions = {
  packId?: string;
  folderId?: string;
};

type ItemCompendium = CompendiumCollection<CompendiumCollection.Metadata & { type: "Item" }>;

type FoundryActionSource = {
  name: string;
  type: "action";
  img: string;
  system: {
    slug: string;
    description: { value: string };
    traits: { value: string[]; rarity: string };
    actionType: { value: string };
    actions: { value: number | null };
    requirements: { value: string };
    source: { value: string };
    rules: unknown[];
  };
  folder?: string;
};

type FoundryItemSource = {
  name: string;
  type: string;
  img: string;
  system: {
    slug: string;
    description: { value: string };
    traits: { value: string[]; rarity: string };
    level: { value: number };
    price: { value: Record<string, number> };
    source: { value: string };
    rules: unknown[];
  };
  folder?: string;
};

type FoundryActorStrikeSource = {
  _id: string;
  name: string;
  type: "melee";
  img: string;
  system: {
    slug: string;
    bonus: { value: number };
    damageRolls: Record<string, { damage: string; damageType: string | null; category: string | null }>;
    traits: { value: string[]; otherTags: string[] };
    rules: unknown[];
    description: { value: string; gm: string };
    publication: { title: string; authors: string; license: string; remaster: boolean };
    attackEffects: { value: string[] };
  };
  effects: unknown[];
  folder: null;
  sort: number;
  flags: Record<string, unknown>;
};

type FoundryActorActionSource = {
  _id: string;
  name: string;
  type: "action";
  img: string;
  system: {
    actionType: { value: string };
    actions: { value: number | null };
    category: string;
    traits: { value: string[]; otherTags: string[] };
    description: { value: string; gm: string };
    requirements: { value: string };
    trigger: { value: string };
    frequency: { value: string };
    rules: unknown[];
    publication: { title: string; authors: string; license: string; remaster: boolean };
  };
  effects: unknown[];
  folder: null;
  sort: number;
  flags: Record<string, unknown>;
};

type FoundryActorItemSource = FoundryActorStrikeSource | FoundryActorActionSource;

type FoundryActorSource = {
  name: string;
  type: string;
  img: string;
  system: {
    slug: string;
    traits: {
      value: string[];
      rarity: string;
      size: { value: string };
      otherTags: string[];
    };
    details: {
      level: { value: number };
      alignment: { value: string };
      publicNotes: string;
      privateNotes: string;
      blurb: string;
      languages: { value: string[]; details: string };
      source: { value: string };
      publication: { title: string; authors: string; license: string; remaster: boolean };
    };
    initiative: { statistic: string };
    attributes: {
      hp: { value: number; max: number; temp: number; details: string };
      ac: { value: number; details: string };
      speed: {
        value: number;
        details: string;
        otherSpeeds: { type: string; value: number; details: string }[];
      };
      immunities: { type: string; exceptions: string[]; notes: string }[];
      weaknesses: { type: string; value: number; exceptions: string[]; notes: string }[];
      resistances: { type: string; value: number; exceptions: string[]; doubleVs: string[]; notes: string }[];
      allSaves: { value: string };
    };
    resources: Record<string, unknown>;
    _migration: {
      version: number;
      previous: { schema: number; foundry: string; system: string };
    };
    perception: { mod: number; details: string; senses: string[]; vision: boolean };
    saves: {
      fortitude: { value: number; saveDetail: string };
      reflex: { value: number; saveDetail: string };
      will: { value: number; saveDetail: string };
    };
    abilities: Record<string, { mod: number }>;
    skills: Record<string, { value: number; base: number; details: string }>;
  };
  prototypeToken: Record<string, unknown>;
  items: FoundryActorItemSource[];
  effects: unknown[];
  folder: string | null;
  flags: Record<string, unknown>;
};

function ensureValidAction(data: ActionSchemaData): void {
  const validation = validate("action", data);
  if (validation.ok) {
    return;
  }

  const messages = validation.errors.map((error) => formatError(error));
  throw new Error(`Action JSON failed validation:\n${messages.join("\n")}`);
}

function trimArray(values: readonly string[] | null | undefined): string[] {
  if (!values?.length) {
    return [];
  }

  return values.map((value) => value.trim()).filter((value) => value.length > 0);
}

function sanitizeText(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function resolveActiveSystemId(): string | undefined {
  const system = (game as Game | undefined)?.system as
    | { id?: unknown; data?: { id?: unknown } }
    | undefined;
  if (!system) {
    return undefined;
  }

  if (typeof system.id === "string") {
    return system.id;
  }

  const legacyId = (system as { data?: { id?: unknown } }).data?.id;
  return typeof legacyId === "string" ? legacyId : undefined;
}

function assertSystemCompatibility(expected: SystemId): void {
  const active = resolveActiveSystemId();
  if (active && active !== expected) {
    throw new Error(
      `System ID mismatch: payload targets "${expected}" but the active system is "${active}".`,
    );
  }
}

function applyInlineFormatting(text: string): string {
  const glyphPattern = /\[(one-action|two-actions|three-actions|reaction|free-action|free)\]/gi;
  const boldPattern = /\*\*(.+?)\*\*/g;
  const italicPattern = /(^|[^*])\*(?!\s)([^*]+?)\*/g;
  const codePattern = /`([^`]+?)`/g;

  let formatted = text;
  formatted = formatted.replace(glyphPattern, (_match, group: string) => {
    const token = group.toLowerCase();
    const glyph = GLYPH_MAP[token];
    return glyph ? `<span class="pf2-icon">${glyph}</span>` : _match;
  });

  formatted = formatted.replace(boldPattern, "<strong>$1</strong>");
  formatted = formatted.replace(italicPattern, (_match, prefix: string, content: string) => `${prefix}<em>${content}</em>`);
  formatted = formatted.replace(codePattern, "<code>$1</code>");

  return formatted;
}

function buildParagraph(lines: string[]): string {
  const content = lines.map((line) => applyInlineFormatting(line)).join("<br />");
  return `<p>${content}</p>`;
}

function buildList(items: string[]): string {
  const entries = items.map((item) => `<li>${applyInlineFormatting(item)}</li>`).join("");
  return `<ul>${entries}</ul>`;
}

function toRichText(text: string | null | undefined): string {
  const value = text?.trim();
  if (!value) {
    return "";
  }

  const lines = value.split(/\r?\n/);
  const blocks: string[] = [];
  let paragraph: string[] = [];
  let listItems: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) {
      return;
    }

    blocks.push(buildParagraph(paragraph));
    paragraph = [];
  };

  const flushList = () => {
    if (!listItems.length) {
      return;
    }

    blocks.push(buildList(listItems));
    listItems = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    const bulletMatch = line.match(/^(?:[-*•]\s+)(.+)$/);
    if (bulletMatch) {
      flushParagraph();
      listItems.push(bulletMatch[1].trim());
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  flushParagraph();
  flushList();

  return blocks.join("");
}

function priceToCoins(price: number | null | undefined): Record<string, number> {
  if (!price || price <= 0) {
    return { pp: 0, gp: 0, sp: 0, cp: 0 };
  }

  const copperTotal = Math.round(price * 100);
  const pp = Math.floor(copperTotal / 1000);
  let remainder = copperTotal % 1000;
  const gp = Math.floor(remainder / 100);
  remainder %= 100;
  const sp = Math.floor(remainder / 10);
  remainder %= 10;
  const cp = remainder;

  return { pp, gp, sp, cp };
}

function matchesSlug(candidate: unknown, slug: string): boolean {
  if (!candidate) {
    return false;
  }

  const doc = candidate as { system?: { slug?: string | null }; slug?: string | null };
  const value = doc.system?.slug ?? doc.slug;
  return typeof value === "string" && value === slug;
}

function extractIndexEntries(index: unknown): PackIndexEntry[] {
  if (!index) {
    return [];
  }

  if (Array.isArray(index)) {
    return index as PackIndexEntry[];
  }

  const result: PackIndexEntry[] = [];
  const candidate = index as { values?: () => Iterable<unknown>; contents?: unknown };

  if (typeof candidate.values === "function") {
    for (const entry of candidate.values() as Iterable<PackIndexEntry>) {
      result.push(entry);
    }
    return result;
  }

  const contents = (candidate as { contents?: unknown }).contents;
  if (Array.isArray(contents)) {
    return contents as PackIndexEntry[];
  }

  if (contents && typeof (contents as { values?: () => Iterable<unknown> }).values === "function") {
    for (const entry of (contents as { values: () => Iterable<unknown> }).values() as Iterable<PackIndexEntry>) {
      result.push(entry);
    }
  }

  return result;
}

async function findPackDocument(pack: ItemCompendium, slug: string): Promise<Item | undefined> {
  const indexEntries = extractIndexEntries(pack.index);
  let entry = indexEntries.find((item) => matchesSlug(item, slug));

  if (!entry && typeof pack.getIndex === "function") {
    const index = await pack.getIndex({ fields: ["slug", "system.slug"] as any });
    const candidates = extractIndexEntries(index);
    entry = candidates.find((item) => matchesSlug(item, slug));
  }

  if (!entry) {
    return undefined;
  }

  const id = entry._id ?? entry.id;
  if (!id) {
    return undefined;
  }

  const existing = (await pack.getDocument(id)) as Item | null | undefined;
  return existing ?? undefined;
}

function findWorldItem(slug: string): Item | undefined {
  const collection = (game as Game).items as unknown;
  if (!collection) {
    return undefined;
  }

  const items = Array.isArray(collection)
    ? collection
    : (collection as { contents?: unknown; values?: () => Iterable<unknown>; find?: (predicate: (item: Item) => boolean) => Item | undefined });

  if (typeof items.find === "function") {
    const found = items.find((item: Item) => matchesSlug(item, slug));
    if (found) {
      return found;
    }
  }

  const contentsCandidate = (items as { contents?: unknown }).contents;
  if (Array.isArray(contentsCandidate)) {
    for (const item of contentsCandidate as Item[]) {
      if (matchesSlug(item, slug)) {
        return item;
      }
    }
  } else if (contentsCandidate && typeof (contentsCandidate as { values?: () => Iterable<Item> }).values === "function") {
    for (const item of (contentsCandidate as { values: () => Iterable<Item> }).values()) {
      if (matchesSlug(item, slug)) {
        return item;
      }
    }
  }

  if (typeof (items as { values?: () => Iterable<Item> }).values === "function") {
    for (const item of (items as { values: () => Iterable<Item> }).values()!) {
      if (matchesSlug(item, slug)) {
        return item;
      }
    }
  }

  return undefined;
}

function prepareActionSource(action: ActionSchemaData): FoundryActionSource {
  const actionType = ACTION_TYPE_MAP[action.actionType];
  const traits = trimArray(action.traits);
  const description = toRichText(action.description);
  const requirements = toRichText(action.requirements);
  const source = action.source?.trim() ?? "";

  return {
    name: action.name,
    type: "action",
    img: action.img?.trim() || DEFAULT_ACTION_IMAGE,
    system: {
      slug: action.slug,
      description: { value: description },
      traits: { value: traits, rarity: action.rarity ?? "common" },
      actionType: { value: actionType.value },
      actions: { value: actionType.count },
      requirements: { value: requirements },
      source: { value: source },
      rules: []
    }
  };
}

function prepareItemSource(item: ItemSchemaData): FoundryItemSource {
  const traits = trimArray(item.traits);
  const description = toRichText(item.description);
  const source = item.source?.trim() ?? "";

  return {
    name: item.name,
    type: item.itemType,
    img: item.img?.trim() || DEFAULT_ITEM_IMAGE,
    system: {
      slug: item.slug,
      description: { value: description },
      traits: { value: traits, rarity: item.rarity },
      level: { value: item.level },
      price: { value: priceToCoins(item.price) },
      source: { value: source },
      rules: []
    }
  };
}

function prepareActorSource(actor: ActorSchemaData): FoundryActorSource {
  const traits = trimArray(actor.traits).map((value) => value.toLowerCase());
  const languages = trimArray(actor.languages).map((value) => value.toLowerCase());
  const source = sanitizeText(actor.source);
  const description = toRichText(actor.description);
  const privateNotes = toRichText(actor.recallKnowledge);
  const alignment = sanitizeText(actor.alignment);

  const strikes = actor.strikes.map((strike) => createStrikeItem(actor, strike));
  const actions = actor.actions.map((action) => createActionItem(action));
  const spellcastingActions = actor.spellcasting
    ?.map((entry) => createSpellcastingAction(entry))
    .filter((entry): entry is FoundryActorActionSource => entry !== null);

  const items: FoundryActorItemSource[] = [...strikes, ...actions];
  if (spellcastingActions?.length) {
    items.push(...spellcastingActions);
  }

  return {
    name: actor.name,
    type: actor.actorType === "npc" ? "npc" : actor.actorType,
    img: actor.img?.trim() || DEFAULT_ACTOR_IMAGE,
    system: {
      slug: actor.slug,
      traits: {
        value: traits,
        rarity: actor.rarity,
        size: { value: actor.size },
        otherTags: [],
      },
      details: {
        level: { value: actor.level },
        alignment: { value: alignment },
        publicNotes: description,
        privateNotes,
        blurb: "",
        languages: { value: languages, details: "" },
        source: { value: source },
        publication: { title: source, authors: "", license: "OGL", remaster: false },
      },
      initiative: { statistic: "perception" },
      attributes: {
        hp: {
          value: actor.attributes.hp.value,
          max: actor.attributes.hp.max,
          temp: actor.attributes.hp.temp ?? 0,
          details: sanitizeText(actor.attributes.hp.details),
        },
        ac: {
          value: actor.attributes.ac.value,
          details: sanitizeText(actor.attributes.ac.details),
        },
        speed: {
          value: actor.attributes.speed.value,
          details: sanitizeText(actor.attributes.speed.details),
          otherSpeeds: (actor.attributes.speed.other ?? []).map((entry) => ({
            type: entry.type,
            value: entry.value,
            details: sanitizeText(entry.details),
          })),
        },
        immunities: (actor.attributes.immunities ?? []).map((entry) => ({
          type: entry.type,
          exceptions: trimArray(entry.exceptions).map((value) => value.toLowerCase()),
          notes: sanitizeText(entry.details),
        })),
        weaknesses: (actor.attributes.weaknesses ?? []).map((entry) => ({
          type: entry.type,
          value: entry.value,
          exceptions: trimArray(entry.exceptions).map((value) => value.toLowerCase()),
          notes: sanitizeText(entry.details),
        })),
        resistances: (actor.attributes.resistances ?? []).map((entry) => ({
          type: entry.type,
          value: entry.value,
          exceptions: trimArray(entry.exceptions).map((value) => value.toLowerCase()),
          doubleVs: trimArray(entry.doubleVs).map((value) => value.toLowerCase()),
          notes: sanitizeText(entry.details),
        })),
        allSaves: { value: "" },
      },
      resources: {},
      _migration: {
        version: 0.943,
        previous: { schema: 0.942, foundry: "13.348", system: "7.5.2" },
      },
      perception: {
        mod: actor.attributes.perception.value,
        details: sanitizeText(actor.attributes.perception.details),
        senses: (actor.attributes.perception.senses ?? []).map((sense) => sense.toLowerCase()),
        vision: true,
      },
      saves: {
        fortitude: {
          value: actor.attributes.saves.fortitude.value,
          saveDetail: sanitizeText(actor.attributes.saves.fortitude.details),
        },
        reflex: {
          value: actor.attributes.saves.reflex.value,
          saveDetail: sanitizeText(actor.attributes.saves.reflex.details),
        },
        will: {
          value: actor.attributes.saves.will.value,
          saveDetail: sanitizeText(actor.attributes.saves.will.details),
        },
      },
      abilities: {
        str: { mod: actor.abilities.str },
        dex: { mod: actor.abilities.dex },
        con: { mod: actor.abilities.con },
        int: { mod: actor.abilities.int },
        wis: { mod: actor.abilities.wis },
        cha: { mod: actor.abilities.cha },
      },
      skills: buildSkillMap(actor.skills),
    },
    prototypeToken: buildPrototypeToken(actor),
    items,
    effects: [],
    folder: null,
    flags: {},
  };
}

function toSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const ACTION_COST_SYSTEM_MAP: Record<ActorSchemaData["actions"][number]["actionCost"], { type: string; value: number | null }> = {
  "one-action": { type: "action", value: 1 },
  "two-actions": { type: "action", value: 2 },
  "three-actions": { type: "action", value: 3 },
  free: { type: "free", value: null },
  reaction: { type: "reaction", value: null },
  passive: { type: "passive", value: null },
};

function createStrikeItem(actor: ActorSchemaData, strike: ActorSchemaData["strikes"][number]): FoundryActorStrikeSource {
  const damageRolls: FoundryActorStrikeSource["system"]["damageRolls"] = {};
  for (const damage of strike.damage) {
    const id = generateId();
    damageRolls[id] = {
      damage: damage.formula,
      damageType: damage.damageType ? damage.damageType.toLowerCase() : null,
      category: null,
    };
  }

  const slug = toSlug(strike.name) || toSlug(generateId());

  return {
    _id: generateId(),
    name: strike.name,
    type: "melee",
    img: DEFAULT_STRIKE_IMAGE,
    system: {
      slug,
      bonus: { value: strike.attackBonus },
      damageRolls,
      traits: {
        value: (strike.traits ?? []).map((trait) => trait.toLowerCase()),
        otherTags: [],
      },
      rules: [],
      description: { value: toRichText(strike.description), gm: "" },
      publication: { title: "", authors: "", license: "OGL", remaster: false },
      attackEffects: { value: (strike.effects ?? []).map((effect) => effect.toLowerCase()) },
    },
    effects: [],
    folder: null,
    sort: 0,
    flags: {},
  };
}

function createActionItem(action: ActorSchemaData["actions"][number]): FoundryActorActionSource {
  const { type, value } = ACTION_COST_SYSTEM_MAP[action.actionCost];
  const details: string[] = [];
  if (action.requirements) {
    details.push(`**Requirements** ${action.requirements}`);
  }
  if (action.trigger) {
    details.push(`**Trigger** ${action.trigger}`);
  }
  if (action.frequency) {
    details.push(`**Frequency** ${action.frequency}`);
  }
  details.push(action.description);
  const description = toRichText(details.join("\n"));

  return {
    _id: generateId(),
    name: action.name,
    type: "action",
    img: DEFAULT_ACTION_IMAGE,
    system: {
      actionType: { value: type },
      actions: { value },
      category: "offensive",
      traits: {
        value: (action.traits ?? []).map((trait) => trait.toLowerCase()),
        otherTags: [],
      },
      description: { value: description, gm: "" },
      requirements: { value: action.requirements ?? "" },
      trigger: { value: action.trigger ?? "" },
      frequency: { value: action.frequency ?? "" },
      rules: [],
      publication: { title: "", authors: "", license: "OGL", remaster: false },
    },
    effects: [],
    folder: null,
    sort: 0,
    flags: {},
  };
}

function createSpellcastingAction(entry: ActorSpellcastingEntry): FoundryActorActionSource | null {
  const lines: string[] = [];
  if (entry.notes) {
    lines.push(entry.notes);
  }
  if (entry.attackBonus !== undefined && entry.attackBonus !== null) {
    lines.push(`**Spell Attack** ${entry.attackBonus}`);
  }
  if (entry.saveDC !== undefined && entry.saveDC !== null) {
    lines.push(`**Spell DC** ${entry.saveDC}`);
  }
  if (entry.spells.length) {
    const grouped = new Map<number, string[]>();
    for (const spell of entry.spells) {
      const list = grouped.get(spell.level) ?? [];
      list.push(spell.name + (spell.description ? ` — ${spell.description}` : ""));
      grouped.set(spell.level, list);
    }
    const levels = Array.from(grouped.keys()).sort((a, b) => a - b);
    for (const level of levels) {
      const spells = grouped.get(level)!;
      lines.push(`**Level ${level}** ${spells.join("; ")}`);
    }
  }
  if (!lines.length) {
    return null;
  }

  const description = toRichText(lines.join("\n"));
  const traits = [entry.tradition.toLowerCase(), "spellcasting"];

  return {
    _id: generateId(),
    name: `${entry.name} Spellcasting`,
    type: "action",
    img: DEFAULT_ACTION_IMAGE,
    system: {
      actionType: { value: "passive" },
      actions: { value: null },
      category: "spell", 
      traits: { value: traits, otherTags: [] },
      description: { value: description, gm: "" },
      requirements: { value: "" },
      trigger: { value: "" },
      frequency: { value: "" },
      rules: [],
      publication: { title: "", authors: "", license: "OGL", remaster: false },
    },
    effects: [],
    folder: null,
    sort: 0,
    flags: {},
  };
}

function buildSkillMap(
  skills: ActorSchemaData["skills"],
): FoundryActorSource["system"]["skills"] {
  const result: FoundryActorSource["system"]["skills"] = {};
  for (const skill of skills) {
    result[skill.slug] = {
      value: skill.modifier,
      base: skill.modifier,
      details: sanitizeText(skill.details),
    };
  }
  return result;
}

const TOKEN_SIZE_MAP: Record<ActorSchemaData["size"], number> = {
  tiny: 1,
  sm: 1,
  med: 1,
  lg: 2,
  huge: 3,
  grg: 4,
};

function buildPrototypeToken(actor: ActorSchemaData): Record<string, unknown> {
  const img = actor.img?.trim() || DEFAULT_ACTOR_IMAGE;
  const tokenSize = TOKEN_SIZE_MAP[actor.size] ?? 1;
  return {
    name: actor.name,
    displayName: 20,
    actorLink: false,
    width: tokenSize,
    height: tokenSize,
    texture: {
      src: img,
      anchorX: 0.5,
      anchorY: 0.5,
      offsetX: 0,
      offsetY: 0,
      fit: "contain",
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      tint: "#ffffff",
      alphaThreshold: 0.75,
    },
    lockRotation: true,
    rotation: 0,
    alpha: 1,
    disposition: -1,
    displayBars: 20,
    bar1: { attribute: "attributes.hp" },
    bar2: { attribute: null },
    light: {
      negative: false,
      priority: 0,
      alpha: 0.5,
      angle: 360,
      bright: 0,
      color: null,
      coloration: 1,
      dim: 0,
      attenuation: 0.5,
      luminosity: 0.5,
      saturation: 0,
      contrast: 0,
      shadows: 0,
      animation: { type: null, speed: 5, intensity: 5, reverse: false },
      darkness: { min: 0, max: 1 },
    },
    sight: {
      enabled: false,
      range: 0,
      angle: 360,
      visionMode: "basic",
      color: null,
      attenuation: 0.1,
      brightness: 0,
      saturation: 0,
      contrast: 0,
    },
    detectionModes: [],
    occludable: { radius: 0 },
    ring: {
      enabled: false,
      colors: { ring: null, background: null },
      effects: 0,
      subject: { scale: 1, texture: null },
    },
    turnMarker: { mode: 1, animation: null, src: null, disposition: false },
    movementAction: null,
    flags: {
      healthEstimate: {
        dontMarkDead: false,
        hideHealthEstimate: false,
        hideName: false,
      },
    },
    randomImg: false,
    appendNumber: false,
    prependAdjective: false,
  };
}

export function toFoundryActionData(action: ActionSchemaData): FoundryActionSource {
  return prepareActionSource(action);
}

export function toFoundryItemData(item: ItemSchemaData): FoundryItemSource {
  return prepareItemSource(item);
}

export function toFoundryActorData(actor: ActorSchemaData): FoundryActorSource {
  return prepareActorSource(actor);
}

export async function importAction(
  json: ActionSchemaData,
  options: ImportOptions = {}
): Promise<Item> {
  assertSystemCompatibility(json.systemId);
  ensureValidAction(json);
  const source = prepareActionSource(json);
  const { packId, folderId } = options;

  if (folderId) {
    source.folder = folderId;
  }

  if (packId) {
    const pack = game.packs?.get(packId) as ItemCompendium | undefined;
    if (!pack) {
      throw new Error(`Pack with id "${packId}" was not found.`);
    }

    const existing = await findPackDocument(pack, json.slug);
    if (existing) {
      const updateData = { ...source } as Record<string, unknown>;
      if (folderId) {
        updateData.folder = folderId;
      }

      await existing.update(updateData as any);
      return existing;
    }

    const imported = (await pack.importDocument(source as any, { keepId: true } as any)) as Item | null | undefined;
    if (!imported) {
      throw new Error(`Failed to import action "${json.name}" into pack ${pack.collection}`);
    }

    return imported;
  }

  const existing = findWorldItem(json.slug);
  if (existing) {
    const updateData = { ...source } as Record<string, unknown>;
    if (folderId) {
      updateData.folder = folderId;
    }

    await existing.update(updateData as any);
    return existing;
  }

  const created = await Item.create(source as any, { keepId: true } as any);
  if (!created) {
    throw new Error(`Failed to create action "${json.name}" in the world.`);
  }

  return created;
}

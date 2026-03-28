import { CONSTANTS } from "../constants";
import { waitForDialog } from "../foundry/dialog";

const RUNE_STRIPPER_TEMPLATE = `${CONSTANTS.TEMPLATE_PATH}/rune-stripper.hbs`;
const RUNE_COMPENDIUM_PACK_IDS = ["pf2e.equipment-srd", "pf2e.equipment"] as const;
const SUMMARY_TEMPLATE_UUIDS = [
  "Compendium.pf2e.equipment-srd.Item.B6B7tBWJSqOBz5zz",
  "Compendium.pf2e.equipment.Item.B6B7tBWJSqOBz5zz",
] as const;
const RUNE_QUALIFIER_PREFIXES = new Set([
  "greater",
  "major",
  "minor",
  "lesser",
  "moderate",
  "supreme",
  "mythic",
  "true",
]);

type UnknownRecord = Record<string, unknown>;
type RuneKind = "potency" | "striking" | "resilient" | "property";
type RuneStripItemType = "weapon" | "armor";

interface RuneCatalogEntry {
  key: string;
  name: string;
  priceGp: number;
  level: number;
  uuid: string;
  img: string;
  packId: string;
  documentId: string;
  priority: number;
}

interface RuneCatalog {
  runes: Map<string, RuneCatalogEntry>;
  runestoneSource: UnknownRecord;
  runestoneName: string;
  runestoneBasePriceGp: number;
  runestoneUuid: string;
}

interface RuneSelection {
  kind: RuneKind;
  key: string;
  slug: string;
  name: string;
  priceGp: number;
  transferCostGp: number;
  uuid: string;
  img: string;
}

interface WeaponSelection {
  entryKey: string;
  itemType: RuneStripItemType;
  itemTypeLabel: string;
  weaponUuid: string;
  weaponName: string;
  actorName: string;
  runes: RuneSelection[];
  unresolved: string[];
  transferCostGp: number;
  runestoneCostGp: number;
  totalCostGp: number;
  runeCount: number;
  runeSummary: string;
}

interface PayerOption {
  actorId: string;
  label: string;
  selected: boolean;
}

interface RuneStripperViewEntry {
  entryKey: string;
  itemTypeLabel: string;
  weaponName: string;
  actorName: string;
  runeSummary: string;
  runeCount: number;
  transferCostLabel: string;
  runestoneCostLabel: string;
  totalCostLabel: string;
}

interface RuneStripperViewData {
  entries: RuneStripperViewEntry[];
  hasEntries: boolean;
  payerOptions: PayerOption[];
  hasPayerOptions: boolean;
  selectedPayerName: string;
  selectedPayerFundsLabel: string;
  totals: {
    weaponCount: number;
    runeCount: number;
    transferCostLabel: string;
    runestoneCostLabel: string;
    grandTotalLabel: string;
  };
  blockingIssues: string[];
  hasBlockingIssues: boolean;
  canConfirm: boolean;
  isBusy: boolean;
}

interface RuneTotals {
  weaponCount: number;
  runeCount: number;
  transferCostGp: number;
  runestoneCostGp: number;
  grandTotalGp: number;
}

interface WeaponStripTarget {
  entry: WeaponSelection;
  document: Item;
  originalRunes: {
    potency: number;
    striking: number;
    resilient: number;
    property: string[];
  };
}

let cachedRuneCatalogPromise: Promise<RuneCatalog | null> | null = null;
let cachedSummaryTemplatePromise: Promise<UnknownRecord | null> | null = null;
let runeStripperApp: RuneStripperApplication | null = null;

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" ? (value as UnknownRecord) : null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function deepClone<T>(value: T): T {
  const foundryUtils = (globalThis as {
    foundry?: { utils?: { deepClone?: <U>(input: U) => U } };
  }).foundry?.utils;

  if (typeof foundryUtils?.deepClone === "function") {
    return foundryUtils.deepClone(value);
  }

  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeWordTokens(value: string): string[] {
  return value
    .normalize("NFKD")
    .replace(/[`'’]/g, "")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((entry) => entry.length > 0);
}

function toCamelCase(words: string[]): string {
  if (words.length === 0) {
    return "";
  }

  return words
    .map((word, index) => (index === 0 ? word : `${word.charAt(0).toUpperCase()}${word.slice(1)}`))
    .join("");
}

function capitalize(value: string): string {
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : "";
}

function qualifierToPrefix(value: string): string | null {
  const token = normalizeWordTokens(value).at(0);
  if (!token) {
    return null;
  }

  return RUNE_QUALIFIER_PREFIXES.has(token) ? token : null;
}

function buildRuneKeyFromName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) {
    return null;
  }

  const potencyMatch = /^Weapon Potency\s*\(\s*\+([1-4])\s*\)$/i.exec(trimmed);
  if (potencyMatch) {
    return `weaponPotency${potencyMatch[1]}`;
  }

  const armorPotencyMatch = /^Armor Potency\s*\(\s*\+([1-4])\s*\)$/i.exec(trimmed);
  if (armorPotencyMatch) {
    return `armorPotency${armorPotencyMatch[1]}`;
  }

  if (/^Mythic Weapon Potency$/i.test(trimmed)) {
    return "weaponPotency4";
  }

  if (/^Mythic Armor Potency$/i.test(trimmed)) {
    return "armorPotency4";
  }

  let basePart = trimmed;
  let qualifierPart: string | null = null;
  const parentheticalMatch = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(trimmed);
  if (parentheticalMatch) {
    basePart = parentheticalMatch[1].trim();
    qualifierPart = parentheticalMatch[2].trim();
  }

  const baseWords = normalizeWordTokens(basePart);
  if (baseWords.length === 0) {
    return null;
  }

  const leadingPrefix = qualifierToPrefix(baseWords[0]);
  const qualifierPrefix = qualifierPart ? qualifierToPrefix(qualifierPart) : null;
  const prefix = qualifierPrefix ?? leadingPrefix;

  const coreWords = prefix && leadingPrefix ? baseWords.slice(1) : baseWords;
  const core = toCamelCase(coreWords);
  if (!core) {
    return null;
  }

  if (prefix) {
    return `${prefix}${capitalize(core)}`;
  }

  return core;
}

function extractPriceGp(value: unknown): number {
  const record = asRecord(value);
  if (!record) {
    return 0;
  }

  const pp = toNumber(record["pp"]) ?? 0;
  const gp = toNumber(record["gp"]) ?? 0;
  const sp = toNumber(record["sp"]) ?? 0;
  const cp = toNumber(record["cp"]) ?? 0;
  const credits = toNumber(record["credits"]) ?? 0;

  return pp * 10 + gp + sp / 10 + cp / 100 + credits / 10;
}

function roundGp(value: number): number {
  return Math.round(value * 100) / 100;
}

function gpToCopper(gp: number): number {
  return Math.max(Math.round(gp * 100), 0);
}

function coinsFromGp(gpValue: number): UnknownRecord {
  let copper = gpToCopper(gpValue);
  const pp = Math.floor(copper / 1000);
  copper -= pp * 1000;
  const gp = Math.floor(copper / 100);
  copper -= gp * 100;
  const sp = Math.floor(copper / 10);
  copper -= sp * 10;
  const cp = copper;

  const result: UnknownRecord = {};
  if (pp > 0) result["pp"] = pp;
  if (gp > 0) result["gp"] = gp;
  if (sp > 0) result["sp"] = sp;
  if (cp > 0) result["cp"] = cp;
  if (Object.keys(result).length === 0) {
    result["gp"] = 0;
  }
  return result;
}

function formatGp(gp: number): string {
  const rounded = roundGp(gp);
  const fixed = rounded.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
  return `${fixed} gp`;
}

function escapeHtml(value: string): string {
  const utils = foundry.utils as { escapeHTML?: (input: string) => string };
  if (typeof utils.escapeHTML === "function") {
    return utils.escapeHTML(value);
  }

  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildRuneUuid(packId: string, documentId: string): string {
  return `Compendium.${packId}.Item.${documentId}`;
}

function getEntryId(entry: UnknownRecord): string | null {
  const value = entry["_id"] ?? entry["id"];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function extractIndexEntries(index: unknown): UnknownRecord[] {
  if (!index) {
    return [];
  }

  if (Array.isArray(index)) {
    return index.filter((entry): entry is UnknownRecord => !!asRecord(entry));
  }

  const candidate = index as {
    values?: () => Iterable<unknown>;
    contents?: unknown;
  };

  if (typeof candidate.values === "function") {
    return Array.from(candidate.values())
      .map((entry) => asRecord(entry))
      .filter((entry): entry is UnknownRecord => entry !== null);
  }

  if (Array.isArray(candidate.contents)) {
    return candidate.contents
      .map((entry) => asRecord(entry))
      .filter((entry): entry is UnknownRecord => entry !== null);
  }

  return [];
}

function extractCollectionValues<T>(collection: unknown): T[] {
  if (!collection) {
    return [];
  }

  if (Array.isArray(collection)) {
    return collection as T[];
  }

  const candidate = collection as {
    values?: () => Iterable<T>;
    contents?: unknown;
  };

  if (typeof candidate.values === "function") {
    return Array.from(candidate.values());
  }

  if (Array.isArray(candidate.contents)) {
    return candidate.contents as T[];
  }

  return [];
}

function getUsageValue(entry: UnknownRecord): string {
  const system = asRecord(entry["system"]);
  const usage = asRecord(system?.["usage"]);
  const value = usage?.["value"];
  return typeof value === "string" ? value.trim() : "";
}

function getLevelValue(entry: UnknownRecord): number {
  const system = asRecord(entry["system"]);
  const level = asRecord(system?.["level"]);
  return toNumber(level?.["value"] ?? system?.["level"]) ?? 0;
}

function getPriceValue(entry: UnknownRecord): number {
  const system = asRecord(entry["system"]);
  const price = asRecord(system?.["price"]);
  return extractPriceGp(price?.["value"]);
}

function getStringValue(record: UnknownRecord, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value.trim() : "";
}

function potencyKeyForValue(value: number): string | null {
  if (value < 1 || value > 4) {
    return null;
  }
  return `weaponPotency${value}`;
}

function armorPotencyKeyForValue(value: number): string | null {
  if (value < 1 || value > 4) {
    return null;
  }

  return `armorPotency${value}`;
}

function strikingKeyForValue(value: number): string | null {
  switch (value) {
    case 1:
      return "striking";
    case 2:
      return "greaterStriking";
    case 3:
      return "majorStriking";
    case 4:
      return "mythicStriking";
    default:
      return null;
  }
}

function resilientKeyForValue(value: number): string | null {
  switch (value) {
    case 1:
      return "resilient";
    case 2:
      return "greaterResilient";
    case 3:
      return "majorResilient";
    case 4:
      return "mythicResilient";
    default:
      return null;
  }
}

function humanizeRuneSlug(slug: string): string {
  return slug
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

async function buildRuneCatalog(): Promise<RuneCatalog | null> {
  const runes = new Map<string, RuneCatalogEntry>();
  let runestoneSource: UnknownRecord | null = null;
  let runestoneBasePriceGp = 3;
  let runestoneName = "Runestone";
  let runestoneUuid = "";

  for (const [priority, packId] of RUNE_COMPENDIUM_PACK_IDS.entries()) {
    const pack = game.packs?.get(packId);
    if (!pack) {
      continue;
    }

    const packAccess = pack as unknown as {
      collection?: unknown;
      getIndex?: (options?: unknown) => Promise<unknown>;
      getDocument?: (id: string) => Promise<unknown>;
      index?: unknown;
    };
    const resolvedPackId =
      typeof packAccess.collection === "string" && packAccess.collection.trim().length > 0
        ? packAccess.collection.trim()
        : packId;

    const index = typeof packAccess.getIndex === "function"
      ? await packAccess.getIndex({
        fields: [
          "name",
          "type",
          "img",
          "system.usage.value",
          "system.price.value",
          "system.level.value",
        ] as string[],
      })
      : packAccess.index;

    for (const entry of extractIndexEntries(index)) {
      const documentId = getEntryId(entry);
      const name = getStringValue(entry, "name");
      const type = getStringValue(entry, "type");
      if (!documentId || !name) {
        continue;
      }

      if (!runestoneSource && name.toLowerCase() === "runestone") {
        const document = typeof packAccess.getDocument === "function"
          ? await packAccess.getDocument(documentId)
          : null;
        const source = asRecord((document as { toObject?: () => unknown } | null)?.toObject?.());
        if (source) {
          runestoneSource = source;
          const sourceName = getStringValue(source, "name");
          if (sourceName) {
            runestoneName = sourceName;
          }
          const system = asRecord(source["system"]);
          const price = asRecord(system?.["price"]);
          runestoneBasePriceGp = extractPriceGp(price?.["value"]);
          runestoneUuid = buildRuneUuid(resolvedPackId, documentId);
        }
      }

      if (type !== "equipment") {
        continue;
      }

      const usage = getUsageValue(entry);
      if (!usage.startsWith("etched-onto-")) {
        continue;
      }

      const key = buildRuneKeyFromName(name);
      if (!key) {
        continue;
      }

      const candidate: RuneCatalogEntry = {
        key,
        name,
        priceGp: getPriceValue(entry),
        level: getLevelValue(entry),
        uuid: buildRuneUuid(resolvedPackId, documentId),
        img: getStringValue(entry, "img"),
        packId: resolvedPackId,
        documentId,
        priority,
      };

      const existing = runes.get(key);
      if (
        !existing ||
        candidate.priority < existing.priority ||
        (candidate.priority === existing.priority &&
          (candidate.level < existing.level ||
            (candidate.level === existing.level && candidate.priceGp < existing.priceGp)))
      ) {
        runes.set(key, candidate);
      }
    }
  }

  if (!runestoneSource) {
    const fallbackUuid = "Compendium.pf2e.equipment-srd.Item.ev3F9qlMNlNdCOAI";
    const fallbackDocument = await fromUuid(fallbackUuid as any);
    if (fallbackDocument instanceof Item) {
      runestoneSource = asRecord(fallbackDocument.toObject());
      runestoneBasePriceGp = extractPriceGp(
        asRecord(asRecord(runestoneSource?.["system"])?.["price"])?.["value"],
      );
      runestoneUuid = fallbackUuid;
      const fallbackName = fallbackDocument.name?.trim();
      if (fallbackName) {
        runestoneName = fallbackName;
      }
    }
  }

  if (!runestoneSource) {
    ui.notifications?.error(`${CONSTANTS.MODULE_NAME} | Could not locate the PF2E Runestone item.`);
    return null;
  }

  return {
    runes,
    runestoneSource,
    runestoneName,
    runestoneBasePriceGp: roundGp(runestoneBasePriceGp),
    runestoneUuid,
  };
}

async function getRuneCatalog(): Promise<RuneCatalog | null> {
  if (!cachedRuneCatalogPromise) {
    cachedRuneCatalogPromise = buildRuneCatalog();
  }

  return await cachedRuneCatalogPromise;
}

async function loadSummaryTemplateSource(): Promise<UnknownRecord | null> {
  for (const uuid of SUMMARY_TEMPLATE_UUIDS) {
    const document = await fromUuid(uuid as any);
    if (!(document instanceof Item)) {
      continue;
    }

    const source = asRecord(document.toObject());
    if (source && getStringValue(source, "type") === "treasure") {
      return source;
    }
  }

  return null;
}

async function getSummaryTemplateSource(): Promise<UnknownRecord | null> {
  if (!cachedSummaryTemplatePromise) {
    cachedSummaryTemplatePromise = loadSummaryTemplateSource();
  }

  return await cachedSummaryTemplatePromise;
}

async function resolveDroppedItem(dropData: unknown): Promise<Item | null> {
  const record = asRecord(dropData);
  if (!record) {
    return null;
  }

  const uuid = typeof record["uuid"] === "string" ? record["uuid"] : "";
  if (uuid) {
    const document = await fromUuid(uuid as any);
    if (document instanceof Item) {
      return document;
    }
  }

  const actorUuid = typeof record["actorUUID"] === "string" ? record["actorUUID"] : "";
  const itemId = typeof record["id"] === "string" ? record["id"] : "";
  if (actorUuid && itemId) {
    const actorDocument = await fromUuid(actorUuid as any);
    if (actorDocument instanceof Actor) {
      const embedded = actorDocument.items.get(itemId);
      if (embedded) {
        return embedded;
      }
    }
  }

  const dropResolver = Item as unknown as {
    fromDropData?: (data: unknown) => Promise<Item | null>;
    implementation?: { fromDropData?: (data: unknown) => Promise<Item | null> };
  };
  if (typeof dropResolver.fromDropData === "function") {
    return await dropResolver.fromDropData(record);
  }
  if (typeof dropResolver.implementation?.fromDropData === "function") {
    return await dropResolver.implementation.fromDropData(record);
  }

  return null;
}

function extractItemRuneState(item: Item): {
  potency: number;
  striking: number;
  resilient: number;
  property: string[];
} {
  const sourceRecord = asRecord((item as unknown as { _source?: unknown })._source);
  const sourceSystem = asRecord(sourceRecord?.["system"]);
  const sourceRunes = asRecord(sourceSystem?.["runes"]);

  const liveSystem = asRecord((item as unknown as { system?: unknown }).system);
  const liveRunes = asRecord(liveSystem?.["runes"]);
  const runes = sourceRunes ?? liveRunes ?? {};

  const potency = Math.max(Math.floor(toNumber(runes["potency"]) ?? 0), 0);
  const striking = Math.max(Math.floor(toNumber(runes["striking"]) ?? 0), 0);
  const resilient = Math.max(Math.floor(toNumber(runes["resilient"]) ?? 0), 0);
  const property = Array.isArray(runes["property"])
    ? runes["property"]
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
    : [];

  return { potency, striking, resilient, property };
}

function isWeaponItem(item: Item | null | undefined): item is Item {
  const type = (item as unknown as { type?: unknown } | null | undefined)?.type;
  return typeof type === "string" && type === "weapon";
}

function isArmorItem(item: Item | null | undefined): item is Item {
  const type = (item as unknown as { type?: unknown } | null | undefined)?.type;
  return typeof type === "string" && type === "armor";
}

function isRunnableStripItem(item: Item | null | undefined): item is Item {
  return isWeaponItem(item) || isArmorItem(item);
}

function isCharacterActor(actor: Actor | null | undefined): actor is Actor {
  const type = (actor as unknown as { type?: unknown } | null | undefined)?.type;
  return typeof type === "string" && type === "character";
}

function isPartyActor(actor: Actor | null | undefined): actor is Actor {
  const type = (actor as unknown as { type?: unknown } | null | undefined)?.type;
  return typeof type === "string" && type === "party";
}

function computeTotals(entries: WeaponSelection[]): RuneTotals {
  const transferCostGp = roundGp(entries.reduce((sum, entry) => sum + entry.transferCostGp, 0));
  const runestoneCostGp = roundGp(entries.reduce((sum, entry) => sum + entry.runestoneCostGp, 0));
  const runeCount = entries.reduce((sum, entry) => sum + entry.runeCount, 0);

  return {
    weaponCount: entries.length,
    runeCount,
    transferCostGp,
    runestoneCostGp,
    grandTotalGp: roundGp(transferCostGp + runestoneCostGp),
  };
}

function buildRunestoneItemSources(entries: WeaponSelection[], catalog: RuneCatalog): UnknownRecord[] {
  const grouped = new Map<string, { rune: RuneSelection; quantity: number }>();
  for (const entry of entries) {
    for (const rune of entry.runes) {
      const aggregate = grouped.get(rune.key);
      if (aggregate) {
        aggregate.quantity += 1;
      } else {
        grouped.set(rune.key, { rune, quantity: 1 });
      }
    }
  }

  const baseDescription = getStringValue(
    asRecord(asRecord(catalog.runestoneSource["system"])?.["description"]) ?? {},
    "value",
  );
  const sources: UnknownRecord[] = [];

  for (const aggregate of grouped.values()) {
    const source = deepClone(catalog.runestoneSource);
    delete source["_id"];

    const rune = aggregate.rune;
    source["name"] = `${rune.name} Runestone`;
    if (rune.img) {
      source["img"] = rune.img;
    }

    const system = asRecord(source["system"]) ?? {};
    source["system"] = system;
    system["quantity"] = aggregate.quantity;

    const price = asRecord(system["price"]) ?? {};
    price["value"] = coinsFromGp(catalog.runestoneBasePriceGp + rune.priceGp);
    system["price"] = price;

    const runeLink = rune.uuid
      ? `@UUID[${rune.uuid}]{${escapeHtml(rune.name)}}`
      : `<strong>${escapeHtml(rune.name)}</strong>`;
    const details = [
      `<p>This runestone stores ${runeLink}.</p>`,
      `<p>Rune value: ${formatGp(rune.priceGp)}. Transfer cost paid: ${formatGp(rune.transferCostGp)}.</p>`,
      `<p>Generated by ${escapeHtml(CONSTANTS.MODULE_NAME)} Rune Stripper.</p>`,
    ].join("");

    const description = asRecord(system["description"]) ?? {};
    description["value"] = baseDescription ? `${baseDescription}<hr/>${details}` : details;
    system["description"] = description;

    const flags = asRecord(source["flags"]) ?? {};
    flags[CONSTANTS.MODULE_ID] = {
      runeStripper: {
        runeKey: rune.key,
        runeName: rune.name,
        runePriceGp: rune.priceGp,
        transferCostGp: rune.transferCostGp,
        runeUuid: rune.uuid,
      },
    };
    source["flags"] = flags;

    sources.push(source);
  }

  return sources;
}

function buildSummaryItemSource(
  entries: WeaponSelection[],
  totals: RuneTotals,
  payerActor: Actor,
  summaryTemplateSource: UnknownRecord | null,
): UnknownRecord {
  const source = summaryTemplateSource
    ? deepClone(summaryTemplateSource)
    : {
      name: "Gold Pieces",
      type: "treasure",
      img: "systems/pf2e/icons/equipment/treasure/currency/gold-pieces.webp",
      system: {
        baseItem: null,
        bulk: { value: 0 },
        category: "art-object",
        containerId: null,
        description: { value: "" },
        hardness: 0,
        hp: { max: 0, value: 0 },
        level: { value: 0 },
        material: { grade: null, type: null },
        price: { value: { gp: 0 } },
        quantity: 1,
        rules: [],
        size: "med",
        traits: { rarity: "common", value: [] },
      },
    };
  delete source["_id"];

  source["name"] = "Rune Strip Summary Ledger";
  source["type"] = "treasure";
  source["img"] = "icons/sundries/books/book-open-blue.webp";

  const system = asRecord(source["system"]) ?? {};
  source["system"] = system;
  system["quantity"] = 1;
  system["category"] = "art-object";

  const bulk = asRecord(system["bulk"]) ?? {};
  bulk["value"] = 0;
  system["bulk"] = bulk;

  const level = asRecord(system["level"]) ?? {};
  level["value"] = 0;
  system["level"] = level;

  const price = asRecord(system["price"]) ?? {};
  price["value"] = { gp: 0 };
  system["price"] = price;

  const tableRows = entries
    .map((entry) => [
      "<tr>",
      `<td>${escapeHtml(entry.weaponName)}</td>`,
      `<td>${escapeHtml(entry.itemTypeLabel)}</td>`,
      `<td>${escapeHtml(entry.actorName)}</td>`,
      `<td>${escapeHtml(entry.runeSummary)}</td>`,
      `<td>${formatGp(entry.transferCostGp)}</td>`,
      `<td>${formatGp(entry.runestoneCostGp)}</td>`,
      `<td>${formatGp(entry.totalCostGp)}</td>`,
      "</tr>",
    ].join(""))
    .join("");

  const summaryHtml = [
    "<p>This blank ledger summarizes the latest Rune Stripper split.</p>",
    "<ul>",
    `<li>Items processed: <strong>${totals.weaponCount}</strong></li>`,
    `<li>Runes extracted: <strong>${totals.runeCount}</strong></li>`,
    `<li>Payer: <strong>${escapeHtml(payerActor.name ?? "Unknown")}</strong></li>`,
    `<li>Total charge: <strong>${formatGp(totals.grandTotalGp)}</strong></li>`,
    "</ul>",
    "<table>",
    "<thead>",
    "<tr><th>Item</th><th>Type</th><th>Owner</th><th>Runes</th><th>Transfer</th><th>Runestones</th><th>Total</th></tr>",
    "</thead>",
    "<tbody>",
    tableRows,
    "</tbody>",
    "</table>",
  ].join("");

  const description = asRecord(system["description"]) ?? {};
  description["value"] = summaryHtml;
  system["description"] = description;

  const flags = asRecord(source["flags"]) ?? {};
  flags[CONSTANTS.MODULE_ID] = {
    runeStripper: {
      summary: true,
      itemCount: totals.weaponCount,
      runeCount: totals.runeCount,
      transferCostGp: totals.transferCostGp,
      runestoneCostGp: totals.runestoneCostGp,
      grandTotalGp: totals.grandTotalGp,
    },
  };
  source["flags"] = flags;

  return source;
}

class RuneStripperApplication extends FormApplication {
  #entries: WeaponSelection[] = [];
  #payerActorId: string | null = null;
  #busy = false;

  constructor(options?: Partial<FormApplicationOptions>) {
    super(undefined, options);
  }

  static override get defaultOptions(): FormApplicationOptions {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "handy-dandy-rune-stripper",
      title: "Handy Dandy | Rune Stripper",
      template: RUNE_STRIPPER_TEMPLATE,
      width: 940,
      height: "auto",
      closeOnSubmit: false,
      submitOnChange: false,
      classes: ["handy-dandy", "rune-stripper"],
    });
  }

  override async getData(): Promise<RuneStripperViewData> {
    const totals = computeTotals(this.#entries);
    const payerOptions = this.#resolvePayerOptions();
    const selectedPayer = this.#getSelectedPayerActor();
    const availableCopper = this.#getPayerAvailableCopper(selectedPayer);
    const totalCopper = gpToCopper(totals.grandTotalGp);

    const selectedPayerName = selectedPayer?.name ?? "None";
    const selectedPayerFundsLabel = availableCopper === null
      ? "Unavailable"
      : formatGp(availableCopper / 100);

    const blockingIssues: string[] = [];
    if (this.#entries.length === 0) {
      blockingIssues.push("Add at least one weapon or armor item with transferable runes.");
    }
    if (payerOptions.length === 0) {
      blockingIssues.push("Select a payer linked to a player character or party sheet.");
    }
    const unresolved = this.#entries.flatMap((entry) => entry.unresolved);
    if (unresolved.length > 0) {
      blockingIssues.push(...unresolved);
    }
    if (availableCopper !== null && availableCopper < totalCopper) {
      blockingIssues.push(
        `Selected payer has insufficient funds (${formatGp(availableCopper / 100)} available; ` +
          `${formatGp(totals.grandTotalGp)} required).`,
      );
    }

    return {
      entries: this.#entries.map((entry) => ({
        entryKey: entry.entryKey,
        itemTypeLabel: entry.itemTypeLabel,
        weaponName: entry.weaponName,
        actorName: entry.actorName,
        runeSummary: entry.runeSummary,
        runeCount: entry.runeCount,
        transferCostLabel: formatGp(entry.transferCostGp),
        runestoneCostLabel: formatGp(entry.runestoneCostGp),
        totalCostLabel: formatGp(entry.totalCostGp),
      })),
      hasEntries: this.#entries.length > 0,
      payerOptions,
      hasPayerOptions: payerOptions.length > 0,
      selectedPayerName,
      selectedPayerFundsLabel,
      totals: {
        weaponCount: totals.weaponCount,
        runeCount: totals.runeCount,
        transferCostLabel: formatGp(totals.transferCostGp),
        runestoneCostLabel: formatGp(totals.runestoneCostGp),
        grandTotalLabel: formatGp(totals.grandTotalGp),
      },
      blockingIssues,
      hasBlockingIssues: blockingIssues.length > 0,
      canConfirm: !this.#busy && blockingIssues.length === 0,
      isBusy: this.#busy,
    };
  }

  override activateListeners(html: JQuery): void {
    super.activateListeners(html);

    const root = html[0];
    root.addEventListener("dragover", (event) => {
      event.preventDefault();
    });

    const dropZone = root.querySelector<HTMLElement>("[data-rune-stripper-dropzone]");
    if (dropZone) {
      const setDropActive = (active: boolean): void => {
        dropZone.classList.toggle("is-dragover", active);
      };

      dropZone.addEventListener("dragenter", (event) => {
        event.preventDefault();
        setDropActive(true);
      });

      dropZone.addEventListener("dragover", (event) => {
        event.preventDefault();
        setDropActive(true);
      });

      dropZone.addEventListener("dragleave", () => {
        setDropActive(false);
      });

      dropZone.addEventListener("drop", (event) => {
        event.preventDefault();
        setDropActive(false);
        void this.#handleDrop(event);
      });
    }

    html.find<HTMLButtonElement>("button[data-action='remove-entry']").on("click", (event) => {
      event.preventDefault();
      const button = event.currentTarget;
      const entryKey = button.dataset.entryKey;
      if (!entryKey) {
        return;
      }
      this.#entries = this.#entries.filter((entry) => entry.entryKey !== entryKey);
      this.render();
    });

    html.find<HTMLButtonElement>("button[data-action='clear-all']").on("click", (event) => {
      event.preventDefault();
      this.#entries = [];
      this.render();
    });

    html.find<HTMLButtonElement>("button[data-action='refresh']").on("click", (event) => {
      event.preventDefault();
      void this.#refreshSelections();
    });

    html.find<HTMLButtonElement>("button[data-action='confirm-strip']").on("click", (event) => {
      event.preventDefault();
      void this.#confirmAndExecute();
    });

    html.find<HTMLSelectElement>("select[data-action='payer-select']").on("change", (event) => {
      const selected = (event.currentTarget as HTMLSelectElement).value.trim();
      this.#payerActorId = selected || null;
      this.render();
    });
  }

  protected override async _updateObject(
    _event: Event,
    _formData: Record<string, unknown>,
  ): Promise<void> {
    // Form submission is handled by button actions.
  }

  async #handleDrop(event: DragEvent): Promise<void> {
    if (this.#busy) {
      return;
    }

    const raw = event.dataTransfer?.getData("text/plain")?.trim();
    if (!raw) {
      ui.notifications?.warn(`${CONSTANTS.MODULE_NAME} | Drop data was empty.`);
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      ui.notifications?.warn(`${CONSTANTS.MODULE_NAME} | Unsupported drop payload.`);
      return;
    }

    const item = await resolveDroppedItem(parsed);
    if (!(item instanceof Item)) {
      ui.notifications?.warn(`${CONSTANTS.MODULE_NAME} | Could not resolve an item from the drop.`);
      return;
    }

    await this.#addWeapon(item);
  }

  async #addWeapon(item: Item): Promise<void> {
    if (!isRunnableStripItem(item)) {
      ui.notifications?.warn(`${CONSTANTS.MODULE_NAME} | Only PF2E weapon or armor items can be stripped.`);
      return;
    }

    const weaponUuid = item.uuid ?? "";
    if (!weaponUuid) {
      ui.notifications?.warn(`${CONSTANTS.MODULE_NAME} | The dropped item is missing a UUID.`);
      return;
    }

    if (this.#entries.some((entry) => entry.weaponUuid === weaponUuid)) {
      ui.notifications?.info(`${CONSTANTS.MODULE_NAME} | ${item.name} is already in the queue.`);
      return;
    }

    const selection = await this.#buildSelection(item);
    if (!selection) {
      ui.notifications?.warn(
        `${CONSTANTS.MODULE_NAME} | ${item.name} has no transferable weapon/armor runes.`,
      );
      return;
    }

    this.#entries.push(selection);
    this.render();
  }

  async #refreshSelections(options: { silent?: boolean } = {}): Promise<void> {
    const refreshed: WeaponSelection[] = [];
    const removed: string[] = [];

    for (const entry of this.#entries) {
      const current = await fromUuid(entry.weaponUuid as any);
      if (!(current instanceof Item) || !isRunnableStripItem(current)) {
        removed.push(entry.weaponName);
        continue;
      }

      const rebuilt = await this.#buildSelection(current);
      if (!rebuilt) {
        removed.push(entry.weaponName);
        continue;
      }

      refreshed.push(rebuilt);
    }

    this.#entries = refreshed;
    if (!options.silent && removed.length > 0) {
      const preview = removed.slice(0, 5).join(", ");
      const suffix = removed.length > 5 ? ` (+${removed.length - 5} more)` : "";
      ui.notifications?.warn(
        `${CONSTANTS.MODULE_NAME} | Removed unavailable or rune-less items: ${preview}${suffix}.`,
      );
    } else if (!options.silent) {
      ui.notifications?.info(`${CONSTANTS.MODULE_NAME} | Rune queue refreshed.`);
    }

    this.render();
  }

  async #buildSelection(item: Item): Promise<WeaponSelection | null> {
    const catalog = await getRuneCatalog();
    if (!catalog) {
      return null;
    }

    if (!isRunnableStripItem(item)) {
      return null;
    }

    const itemType: RuneStripItemType = isArmorItem(item) ? "armor" : "weapon";
    const itemTypeLabel = itemType === "armor" ? "Armor" : "Weapon";
    const runes = extractItemRuneState(item);
    const requested: Array<{ kind: RuneKind; key: string; slug: string }> = [];

    const potencyKey = itemType === "armor"
      ? armorPotencyKeyForValue(runes.potency)
      : potencyKeyForValue(runes.potency);
    if (potencyKey) {
      requested.push({ kind: "potency", key: potencyKey, slug: potencyKey });
    }

    if (itemType === "weapon") {
      const strikingKey = strikingKeyForValue(runes.striking);
      if (strikingKey) {
        requested.push({ kind: "striking", key: strikingKey, slug: strikingKey });
      }
    } else {
      const resilientKey = resilientKeyForValue(runes.resilient);
      if (resilientKey) {
        requested.push({ kind: "resilient", key: resilientKey, slug: resilientKey });
      }
    }

    for (const propertySlug of runes.property) {
      requested.push({ kind: "property", key: propertySlug, slug: propertySlug });
    }

    if (requested.length === 0) {
      return null;
    }

    const selectedRunes: RuneSelection[] = [];
    const unresolved: string[] = [];
    const weaponName = item.name ?? "Unnamed Item";

    for (const request of requested) {
      const catalogEntry = catalog.runes.get(request.key);
      if (!catalogEntry) {
        unresolved.push(
          `${weaponName}: could not resolve rune "${humanizeRuneSlug(request.slug)}" from PF2E compendiums.`,
        );
        continue;
      }

      selectedRunes.push({
        kind: request.kind,
        key: request.key,
        slug: request.slug,
        name: catalogEntry.name,
        priceGp: roundGp(catalogEntry.priceGp),
        transferCostGp: roundGp(catalogEntry.priceGp * 0.1),
        uuid: catalogEntry.uuid,
        img: catalogEntry.img,
      });
    }

    if (selectedRunes.length === 0) {
      return null;
    }

    const transferCostGp = roundGp(selectedRunes.reduce((sum, rune) => sum + rune.transferCostGp, 0));
    const runestoneCostGp = roundGp(selectedRunes.length * catalog.runestoneBasePriceGp);
    const totalCostGp = roundGp(transferCostGp + runestoneCostGp);
    const actorName = item.actor?.name?.trim() || "World Item Directory";

    return {
      entryKey: item.uuid,
      itemType,
      itemTypeLabel,
      weaponUuid: item.uuid,
      weaponName,
      actorName,
      runes: selectedRunes,
      unresolved,
      transferCostGp,
      runestoneCostGp,
      totalCostGp,
      runeCount: selectedRunes.length,
      runeSummary: selectedRunes.map((rune) => rune.name).join(", "),
    };
  }

  #resolvePayerOptions(): PayerOption[] {
    const options: PayerOption[] = [];
    const seenActorIds = new Set<string>();

    if (game.user?.isGM) {
      const users = extractCollectionValues<User>(game.users);
      for (const user of users) {
        const character = user.character;
        if (!(character instanceof Actor) || !isCharacterActor(character) || !character.id) {
          continue;
        }
        if (seenActorIds.has(character.id)) {
          continue;
        }
        seenActorIds.add(character.id);
        options.push({
          actorId: character.id,
          label: `${user.name} -> ${character.name}`,
          selected: false,
        });
      }

      for (const actor of extractCollectionValues<Actor>(game.actors)) {
        if (!isPartyActor(actor) || !actor.id || seenActorIds.has(actor.id)) {
          continue;
        }
        seenActorIds.add(actor.id);
        options.push({
          actorId: actor.id,
          label: `Party -> ${actor.name}`,
          selected: false,
        });
      }

      for (const actor of extractCollectionValues<Actor>(game.actors)) {
        if (!isCharacterActor(actor) || !actor.id || seenActorIds.has(actor.id)) {
          continue;
        }
        seenActorIds.add(actor.id);
        options.push({
          actorId: actor.id,
          label: `${actor.name}`,
          selected: false,
        });
      }
    } else {
      const character = game.user?.character;
      if (character instanceof Actor && isCharacterActor(character) && character.id) {
        seenActorIds.add(character.id);
        options.push({
          actorId: character.id,
          label: character.name ?? "Character",
          selected: false,
        });
      }

      for (const actor of extractCollectionValues<Actor>(game.actors)) {
        if (!isPartyActor(actor) || !actor.id || seenActorIds.has(actor.id) || !actor.isOwner) {
          continue;
        }
        seenActorIds.add(actor.id);
        options.push({
          actorId: actor.id,
          label: `Party -> ${actor.name}`,
          selected: false,
        });
      }
    }

    if (options.length === 0) {
      this.#payerActorId = null;
      return options;
    }

    if (!this.#payerActorId || !options.some((option) => option.actorId === this.#payerActorId)) {
      this.#payerActorId = options[0].actorId;
    }

    return options.map((option) => ({
      ...option,
      selected: option.actorId === this.#payerActorId,
    }));
  }

  #getSelectedPayerActor(): Actor | null {
    if (!this.#payerActorId) {
      return null;
    }

    return (game.actors?.get(this.#payerActorId) as Actor | null | undefined) ?? null;
  }

  #getPayerAvailableCopper(actor: Actor | null): number | null {
    if (!actor) {
      return null;
    }

    const inventory = (actor as unknown as { inventory?: { currency?: { copperValue?: unknown } } }).inventory;
    const copper = toNumber(inventory?.currency?.copperValue);
    return typeof copper === "number" ? Math.max(Math.floor(copper), 0) : null;
  }

  async #resolveStripTargets(): Promise<{ targets: WeaponStripTarget[]; missing: string[] }> {
    const targets: WeaponStripTarget[] = [];
    const missing: string[] = [];

    for (const entry of this.#entries) {
      const document = await fromUuid(entry.weaponUuid as any);
      if (!(document instanceof Item) || !isRunnableStripItem(document)) {
        missing.push(entry.weaponName);
        continue;
      }

      targets.push({
        entry,
        document,
        originalRunes: extractItemRuneState(document),
      });
    }

    return { targets, missing };
  }

  async #restoreWeaponRunes(targets: WeaponStripTarget[]): Promise<string[]> {
    const failures: string[] = [];

    for (const target of targets) {
      try {
        const restoreUpdate = target.entry.itemType === "armor"
          ? {
            "system.runes.potency": target.originalRunes.potency,
            "system.runes.resilient": target.originalRunes.resilient,
            "system.runes.property": [...target.originalRunes.property],
          }
          : {
            "system.runes.potency": target.originalRunes.potency,
            "system.runes.striking": target.originalRunes.striking,
            "system.runes.property": [...target.originalRunes.property],
          };

        await target.document.update(restoreUpdate as any);
      } catch {
        failures.push(target.entry.weaponName);
      }
    }

    return failures;
  }

  async #confirmAndExecute(): Promise<void> {
    if (this.#busy) {
      return;
    }

    await this.#refreshSelections({ silent: true });
    if (this.#entries.length === 0) {
      return;
    }

    const payerActor = this.#getSelectedPayerActor();
    if (!payerActor) {
      ui.notifications?.warn(`${CONSTANTS.MODULE_NAME} | Select a payer before confirming.`);
      return;
    }

    const catalog = await getRuneCatalog();
    if (!catalog) {
      return;
    }

    const totals = computeTotals(this.#entries);
    const confirmationContent = [
      `<div class="handy-dandy-rune-stripper-confirm">`,
      `<p>Strip runes from <strong>${totals.weaponCount}</strong> item(s) and place them into runestones?</p>`,
      `<ul>`,
      `<li>Runes: <strong>${totals.runeCount}</strong></li>`,
      `<li>Transfer cost (RAW 10%): <strong>${formatGp(totals.transferCostGp)}</strong></li>`,
      `<li>Runestone material cost: <strong>${formatGp(totals.runestoneCostGp)}</strong></li>`,
      `<li>Total charge: <strong>${formatGp(totals.grandTotalGp)}</strong></li>`,
      `</ul>`,
      `<p class="notes">Payer: <strong>${escapeHtml(payerActor.name ?? "Unknown")}</strong></p>`,
      `<p class="notes">Output actor type: <strong>Loot</strong> (${escapeHtml(catalog.runestoneName)} derivatives)</p>`,
      `</div>`,
    ].join("");

    const confirmed = await waitForDialog<boolean>({
      title: `${CONSTANTS.MODULE_NAME} | Confirm Rune Strip`,
      content: confirmationContent,
      width: 520,
      buttons: [
        {
          action: "confirm",
          icon: '<i class="fas fa-hammer"></i>',
          label: "Confirm and Strip",
          default: true,
          callback: () => true,
        },
        {
          action: "cancel",
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel",
          callback: () => false,
        },
      ],
      closeResult: false,
    });

    if (!confirmed) {
      return;
    }

    this.#busy = true;
    this.render();
    try {
      await this.#executeStrip(payerActor, catalog);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ui.notifications?.error(`${CONSTANTS.MODULE_NAME} | Rune stripping failed: ${message}`);
      console.error(`${CONSTANTS.MODULE_NAME} | Rune stripping failed`, error);
    } finally {
      this.#busy = false;
      this.render();
    }
  }

  async #executeStrip(payerActor: Actor, catalog: RuneCatalog): Promise<void> {
    const totals = computeTotals(this.#entries);
    const totalCostCp = gpToCopper(totals.grandTotalGp);

    const payerInventory = (payerActor as unknown as {
      inventory?: {
        removeCoins?: (
          coins: Partial<Record<"pp" | "gp" | "sp" | "cp" | "credits" | "upb", number>>,
          options?: { byValue?: boolean },
        ) => Promise<boolean>;
      };
    }).inventory;
    if (!payerInventory || typeof payerInventory.removeCoins !== "function") {
      throw new Error("Selected payer actor does not support PF2E currency transfers.");
    }

    const availableCopper = this.#getPayerAvailableCopper(payerActor);
    if (availableCopper !== null && availableCopper < totalCostCp) {
      ui.notifications?.warn(
        `${CONSTANTS.MODULE_NAME} | ${payerActor.name} does not have enough currency ` +
          `(${formatGp(availableCopper / 100)} available; ${formatGp(totals.grandTotalGp)} required).`,
      );
      return;
    }

    const runestoneSources = buildRunestoneItemSources(this.#entries, catalog);
    if (runestoneSources.length === 0) {
      ui.notifications?.warn(`${CONSTANTS.MODULE_NAME} | No runes were available to export.`);
      return;
    }

    const { targets, missing } = await this.#resolveStripTargets();
    if (missing.length > 0 || targets.length !== this.#entries.length) {
      const preview = missing.slice(0, 5).join(", ");
      const suffix = missing.length > 5 ? ` (+${missing.length - 5} more)` : "";
      ui.notifications?.warn(
        `${CONSTANTS.MODULE_NAME} | Some queued items are no longer available (${preview}${suffix}). ` +
          `Refresh the queue and try again.`,
      );
      return;
    }

    const strippedTargets: WeaponStripTarget[] = [];
    for (const target of targets) {
      try {
        const stripUpdate = target.entry.itemType === "armor"
          ? {
            "system.runes.potency": 0,
            "system.runes.resilient": 0,
            "system.runes.property": [],
          }
          : {
            "system.runes.potency": 0,
            "system.runes.striking": 0,
            "system.runes.property": [],
          };

        await target.document.update(stripUpdate as any);
        strippedTargets.push(target);
      } catch {
        const rollbackFailures = await this.#restoreWeaponRunes(strippedTargets);
        const rollbackMessage = rollbackFailures.length > 0
          ? ` Rollback failed for: ${rollbackFailures.join(", ")}.`
          : "";
        throw new Error(
          `Could not strip rune data from "${target.entry.weaponName}". No charges were applied.${rollbackMessage}`,
        );
      }
    }

    const summaryTemplateSource = await getSummaryTemplateSource();
    const summarySource = buildSummaryItemSource(this.#entries, totals, payerActor, summaryTemplateSource);
    const outputItemSources = [summarySource, ...runestoneSources];

    const timestamp = new Date().toISOString().replace("T", " ").replace("Z", " UTC");
    let lootActor: Actor | null = null;
    try {
      lootActor = (await Actor.create({
        name: `Rune Stripper Output ${timestamp}`,
        type: "loot",
        system: {
          details: {
            description: `<p>Generated by ${escapeHtml(CONSTANTS.MODULE_NAME)} Rune Stripper on ${escapeHtml(timestamp)}.</p>`,
            level: { value: 0 },
          },
          lootSheetType: "Loot",
          hiddenWhenEmpty: false,
        },
      } as any)) as Actor | null;

      if (!lootActor) {
        throw new Error("Failed to create the output loot actor.");
      }

      await lootActor.createEmbeddedDocuments("Item", outputItemSources as any[]);
    } catch (error) {
      const rollbackFailures = await this.#restoreWeaponRunes(strippedTargets);
      if (lootActor) {
        await lootActor.delete().catch(() => undefined);
      }
      const message = error instanceof Error ? error.message : String(error);
      const rollbackMessage = rollbackFailures.length > 0
        ? ` Rollback failed for: ${rollbackFailures.join(", ")}.`
        : "";
      throw new Error(
        `Failed to create output loot runestones (${message}). Weapon runes were restored.${rollbackMessage}`,
      );
    }

    const charged = await payerInventory.removeCoins({ cp: totalCostCp }, { byValue: true });
    if (!charged) {
      const rollbackFailures = await this.#restoreWeaponRunes(strippedTargets);
      await lootActor.delete();
      const rollbackMessage = rollbackFailures.length > 0
        ? ` Rune restoration failed for: ${rollbackFailures.join(", ")}.`
        : "";
      ui.notifications?.warn(
        `${CONSTANTS.MODULE_NAME} | ${payerActor.name} does not have enough funds. ` +
          `Weapon runes were restored.${rollbackMessage}`,
      );
      return;
    }

    ui.notifications?.info(
      `${CONSTANTS.MODULE_NAME} | Stripped ${totals.runeCount} rune(s) from ${totals.weaponCount} item(s). ` +
        `Charged ${formatGp(totals.grandTotalGp)} to ${payerActor.name}.`,
    );

    lootActor.sheet?.render(true);
    this.#entries = [];
  }
}

export async function runRuneStripperFlow(): Promise<void> {
  if (!runeStripperApp) {
    runeStripperApp = new RuneStripperApplication();
  }

  runeStripperApp.render(true);
}

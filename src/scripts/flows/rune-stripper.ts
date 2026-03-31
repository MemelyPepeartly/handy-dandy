import { CONSTANTS } from "../constants";
import { waitForDialog } from "../foundry/dialog";

const RUNE_STRIPPER_TEMPLATE = `${CONSTANTS.TEMPLATE_PATH}/rune-stripper.hbs`;
const RUNE_COMPENDIUM_PACK_IDS = ["pf2e.equipment-srd", "pf2e.equipment"] as const;
const SUMMARY_TEMPLATE_UUIDS = [
  "Compendium.pf2e.equipment-srd.Item.B6B7tBWJSqOBz5zz",
  "Compendium.pf2e.equipment.Item.B6B7tBWJSqOBz5zz",
] as const;
const SUMMARY_LEDGER_IMAGE = "systems/pf2e/icons/equipment/adventuring-gear/scholarly-journal.webp";
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
const LEVEL_BASED_DCS = new Map<number, number>([
  [-1, 13],
  [0, 14],
  [1, 15],
  [2, 16],
  [3, 18],
  [4, 19],
  [5, 20],
  [6, 22],
  [7, 23],
  [8, 24],
  [9, 26],
  [10, 27],
  [11, 28],
  [12, 30],
  [13, 31],
  [14, 32],
  [15, 34],
  [16, 35],
  [17, 36],
  [18, 38],
  [19, 39],
  [20, 40],
  [21, 42],
  [22, 44],
  [23, 46],
  [24, 48],
  [25, 50],
]);
const PROFICIENCY_RANK_BONUS = [0, 2, 4, 6, 8] as const;

type UnknownRecord = Record<string, unknown>;
type RuneKind = "potency" | "striking" | "resilient" | "property";
type RuneStripItemType = "weapon" | "armor";
type CraftingOutcome = "criticalSuccess" | "success" | "failure" | "criticalFailure";

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
  level: number;
  transferDc: number;
  copies: number;
  successfulCopies: number;
  priceGp: number;
  transferCostGp: number;
  attempts: number;
  failureCount: number;
  criticalFailureCount: number;
  lastOutcome: CraftingOutcome | null;
  lastRollTotal: number | null;
  uuid: string;
  img: string;
}

interface WeaponSelection {
  entryKey: string;
  itemType: RuneStripItemType;
  itemTypeLabel: string;
  weaponUuid: string;
  weaponName: string;
  itemQuantity: number;
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

interface CrafterOption {
  actorId: string;
  label: string;
  selected: boolean;
}

interface RuneStripperViewEntry {
  entryKey: string;
  itemTypeLabel: string;
  weaponName: string;
  itemQuantityLabel: string;
  actorName: string;
  runeSummary: string;
  runeCount: number;
  transferCostLabel: string;
  runestoneCostLabel: string;
  totalCostLabel: string;
  craftingDcLabel: string;
  craftingProgressLabel: string;
  craftingStatusLabel: string;
  hasRollButton: boolean;
}

interface RuneStripperViewData {
  entries: RuneStripperViewEntry[];
  hasEntries: boolean;
  payerOptions: PayerOption[];
  hasPayerOptions: boolean;
  selectedPayerName: string;
  selectedPayerFundsLabel: string;
  crafterOptions: CrafterOption[];
  hasCrafterOptions: boolean;
  selectedCrafterName: string;
  selectedCrafterModifierLabel: string;
  selectedCrafterAssuranceLabel: string;
  selectedCrafterFeatSummary: string;
  craftingRulesSummary: string;
  totals: {
    weaponCount: number;
    runeCount: number;
    minimumDays: number;
    retryDays: number;
    transferCostLabel: string;
    runestoneCostLabel: string;
    lostMaterialsLabel: string;
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
  minimumDays: number;
  retryDays: number;
  transferCostGp: number;
  runestoneCostGp: number;
  lostMaterialsGp: number;
  grandTotalGp: number;
}

interface CrafterInsight {
  actor: Actor | null;
  skill: unknown;
  rank: number;
  modifier: number | null;
  hasCraftingSkill: boolean;
  hasMagicalCrafting: boolean;
  hasAssuranceCrafting: boolean;
  assuranceTotal: number | null;
  relevantCraftingFeats: string[];
}

interface WeaponStripTarget {
  entry: WeaponSelection;
  document: Item;
  originalQuantity: number;
  originalRunes: {
    potency: number;
    striking: number;
    resilient: number;
    property: string[];
  };
}

interface ExecutedStripTarget {
  target: WeaponStripTarget;
  mode: "full" | "partial";
  splitItemUuid?: string;
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

function getPwolEnabled(): boolean {
  const variantRules = (game as unknown as {
    pf2e?: { settings?: { variants?: { pwol?: { enabled?: unknown } } } };
  }).pf2e?.settings?.variants;
  return variantRules?.pwol?.enabled === true;
}

function calculateLevelDc(level: number): number {
  const normalized = Number.isFinite(level) ? Math.trunc(level) : 0;
  const base = LEVEL_BASED_DCS.get(normalized) ?? 14;
  return getPwolEnabled() ? base - Math.max(normalized, 0) : base;
}

function getActorLevel(actor: Actor | null): number {
  if (!(actor instanceof Actor)) {
    return 0;
  }

  const system = asRecord((actor as unknown as { system?: unknown }).system);
  const details = asRecord(system?.["details"]);
  const levelField = details?.["level"];
  const level = toNumber(asRecord(levelField)?.["value"] ?? levelField) ?? 0;
  return Math.max(Math.trunc(level), 0);
}

function getItemLevel(item: Item): number {
  const sourceRecord = asRecord((item as unknown as { _source?: unknown })._source);
  const sourceSystem = asRecord(sourceRecord?.["system"]);
  const sourceLevel = sourceSystem?.["level"];

  const liveSystem = asRecord((item as unknown as { system?: unknown }).system);
  const liveLevel = liveSystem?.["level"];

  const level = toNumber(asRecord(sourceLevel)?.["value"] ?? sourceLevel ?? asRecord(liveLevel)?.["value"] ?? liveLevel) ?? 0;
  return Math.max(Math.trunc(level), -1);
}

function getTransferRuneDc(itemLevel: number, runeLevel: number): number {
  const effectiveLevel = Math.max(Math.trunc(itemLevel), Math.trunc(runeLevel));
  return calculateLevelDc(effectiveLevel);
}

function getItemQuantity(item: Item): number {
  const sourceRecord = asRecord((item as unknown as { _source?: unknown })._source);
  const sourceSystem = asRecord(sourceRecord?.["system"]);
  const sourceQuantity = sourceSystem?.["quantity"];

  const liveSystem = asRecord((item as unknown as { system?: unknown }).system);
  const liveQuantity = liveSystem?.["quantity"];

  const quantity = toNumber(sourceQuantity ?? liveQuantity) ?? 1;
  return Math.max(Math.floor(quantity), 1);
}

function getItemSlug(item: Item): string {
  const directSlug = (item as unknown as { slug?: unknown }).slug;
  if (typeof directSlug === "string" && directSlug.trim().length > 0) {
    return directSlug.trim();
  }

  const sourceRecord = asRecord((item as unknown as { _source?: unknown })._source);
  const sourceSystem = asRecord(sourceRecord?.["system"]);
  const sourceSlug = sourceSystem?.["slug"];
  if (typeof sourceSlug === "string" && sourceSlug.trim().length > 0) {
    return sourceSlug.trim();
  }

  const liveSystem = asRecord((item as unknown as { system?: unknown }).system);
  const liveSlug = liveSystem?.["slug"];
  return typeof liveSlug === "string" && liveSlug.trim().length > 0 ? liveSlug.trim() : "";
}

function getItemRulesSelection(item: Item, selectionKey: string): string | null {
  const sourceFlags = asRecord(asRecord((item as unknown as { _source?: unknown })._source)?.["flags"]);
  const liveFlags = asRecord((item as unknown as { flags?: unknown }).flags);

  for (const flags of [sourceFlags, liveFlags]) {
    const pf2eFlags = asRecord(flags?.["pf2e"]);
    const systemFlags = asRecord(flags?.["system"]);
    const rulesSelections = asRecord(pf2eFlags?.["rulesSelections"]) ?? asRecord(systemFlags?.["rulesSelections"]);
    const value = rulesSelections?.[selectionKey];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function getFeatItems(actor: Actor | null): Item[] {
  if (!(actor instanceof Actor)) {
    return [];
  }

  const itemTypes = (actor as unknown as { itemTypes?: { feat?: unknown } }).itemTypes;
  if (Array.isArray(itemTypes?.feat)) {
    return itemTypes.feat.filter((entry): entry is Item => entry instanceof Item);
  }

  return extractCollectionValues<Item>((actor as unknown as { items?: unknown }).items).filter((item) => {
    const itemType = (item as unknown as { type?: unknown }).type;
    return itemType === "feat";
  });
}

function getCraftingSkill(actor: Actor | null): unknown {
  if (!(actor instanceof Actor)) {
    return null;
  }

  const skills = asRecord((actor as unknown as { skills?: unknown }).skills);
  if (skills?.["crafting"]) {
    return skills["crafting"];
  }
  if (skills?.["cra"]) {
    return skills["cra"];
  }

  const systemSkills = asRecord(asRecord((actor as unknown as { system?: unknown }).system)?.["skills"]);
  if (systemSkills?.["crafting"]) {
    return systemSkills["crafting"];
  }
  if (systemSkills?.["cra"]) {
    return systemSkills["cra"];
  }

  return null;
}

function getCraftingRank(actor: Actor | null, skill: unknown): number {
  const rankFromSkill = toNumber(asRecord(skill)?.["rank"]);
  if (typeof rankFromSkill === "number") {
    return Math.clamp(Math.trunc(rankFromSkill), 0, 4);
  }

  const systemSkills = asRecord(asRecord((actor as unknown as { system?: unknown }).system)?.["skills"]);
  const rankFromSystem = toNumber(
    asRecord(systemSkills?.["crafting"])?.["rank"] ??
      asRecord(systemSkills?.["cra"])?.["rank"],
  );
  return typeof rankFromSystem === "number" ? Math.clamp(Math.trunc(rankFromSystem), 0, 4) : 0;
}

function getCraftingModifier(skill: unknown): number | null {
  const skillRecord = asRecord(skill);
  if (!skillRecord) {
    return null;
  }

  const check = asRecord(skillRecord["check"]);
  const mod = toNumber(check?.["mod"] ?? skillRecord["mod"] ?? skillRecord["totalModifier"]);
  return typeof mod === "number" ? Math.trunc(mod) : null;
}

function getAssuranceTotal(actor: Actor | null, rank: number): number | null {
  if (rank <= 0) {
    return null;
  }

  const proficiencyBonus = PROFICIENCY_RANK_BONUS[Math.clamp(rank, 0, 4)];
  const level = getPwolEnabled() ? 0 : getActorLevel(actor);
  return 10 + proficiencyBonus + level;
}

function isAssuranceForCrafting(feat: Item): boolean {
  const slug = getItemSlug(feat).toLowerCase();
  if (slug === "assurance-crafting") {
    return true;
  }
  if (slug !== "assurance") {
    return false;
  }

  const selection = (getItemRulesSelection(feat, "assurance") ?? "").toLowerCase();
  return selection === "crafting" || selection === "cra" || selection.includes("craft");
}

function isRelevantCraftingFeat(feat: Item): boolean {
  if (isAssuranceForCrafting(feat)) {
    return true;
  }

  const slug = getItemSlug(feat).toLowerCase();
  if (slug.includes("craft")) {
    return true;
  }

  const name = feat.name?.toLowerCase().trim() ?? "";
  return name.includes("craft");
}

function getCrafterInsight(actor: Actor | null): CrafterInsight {
  if (!(actor instanceof Actor) || !isCharacterActor(actor)) {
    return {
      actor: null,
      skill: null,
      rank: 0,
      modifier: null,
      hasCraftingSkill: false,
      hasMagicalCrafting: false,
      hasAssuranceCrafting: false,
      assuranceTotal: null,
      relevantCraftingFeats: [],
    };
  }

  const skill = getCraftingSkill(actor);
  const rank = getCraftingRank(actor, skill);
  const modifier = getCraftingModifier(skill);
  const feats = getFeatItems(actor);
  const hasMagicalCrafting = feats.some((feat) => getItemSlug(feat).toLowerCase() === "magical-crafting");
  const hasAssuranceCrafting = feats.some((feat) => isAssuranceForCrafting(feat));
  const relevantCraftingFeats = feats
    .filter((feat) => isRelevantCraftingFeat(feat))
    .map((feat) => feat.name?.trim() ?? "Unnamed feat")
    .sort((a, b) => a.localeCompare(b));

  const hasCraftingSkill = rank > 0 && skill !== null;

  return {
    actor,
    skill,
    rank,
    modifier,
    hasCraftingSkill,
    hasMagicalCrafting,
    hasAssuranceCrafting,
    assuranceTotal: hasAssuranceCrafting && hasCraftingSkill ? getAssuranceTotal(actor, rank) : null,
    relevantCraftingFeats,
  };
}

function degreeToCraftingOutcome(degree: number | null): CraftingOutcome | null {
  const normalized = typeof degree === "number" ? Math.trunc(degree) : null;
  switch (normalized) {
    case 3:
      return "criticalSuccess";
    case 2:
      return "success";
    case 1:
      return "failure";
    case 0:
      return "criticalFailure";
    default:
      return null;
  }
}

function craftingOutcomeFromTotal(total: number, dc: number): CraftingOutcome {
  if (total >= dc + 10) {
    return "criticalSuccess";
  }
  if (total >= dc) {
    return "success";
  }
  if (total <= dc - 10) {
    return "criticalFailure";
  }
  return "failure";
}

function isSuccessfulOutcome(outcome: CraftingOutcome | null): boolean {
  return outcome === "success" || outcome === "criticalSuccess";
}

function isFailureOutcome(outcome: CraftingOutcome | null): boolean {
  return outcome === "failure" || outcome === "criticalFailure";
}

function getAssuranceAutoSuccessCopies(rune: RuneSelection, crafterInsight: CrafterInsight): number {
  const canAutoSucceed =
    crafterInsight.hasCraftingSkill &&
    crafterInsight.hasAssuranceCrafting &&
    typeof crafterInsight.assuranceTotal === "number" &&
    crafterInsight.assuranceTotal >= rune.transferDc;
  return canAutoSucceed ? rune.copies : 0;
}

function getRuneResolvedCopies(rune: RuneSelection, crafterInsight: CrafterInsight): number {
  const manualSuccesses = Math.clamp(Math.trunc(rune.successfulCopies), 0, rune.copies);
  return Math.max(manualSuccesses, getAssuranceAutoSuccessCopies(rune, crafterInsight));
}

function getRunePendingCopies(rune: RuneSelection, crafterInsight: CrafterInsight): number {
  return Math.max(rune.copies - getRuneResolvedCopies(rune, crafterInsight), 0);
}

function isRunePending(rune: RuneSelection, crafterInsight: CrafterInsight): boolean {
  return getRunePendingCopies(rune, crafterInsight) > 0;
}

function getRuneAssuranceAdditionalCopies(rune: RuneSelection, crafterInsight: CrafterInsight): number {
  if (getAssuranceAutoSuccessCopies(rune, crafterInsight) === 0) {
    return 0;
  }

  const manualSuccesses = Math.clamp(Math.trunc(rune.successfulCopies), 0, rune.copies);
  return Math.max(rune.copies - manualSuccesses, 0);
}

function computeTotals(entries: WeaponSelection[]): RuneTotals {
  const transferCostGp = roundGp(entries.reduce((sum, entry) => sum + entry.transferCostGp, 0));
  const runestoneCostGp = roundGp(entries.reduce((sum, entry) => sum + entry.runestoneCostGp, 0));
  const runeCount = entries.reduce((sum, entry) => sum + entry.runeCount, 0);
  const retryDays = entries.reduce(
    (sum, entry) =>
      sum +
      entry.runes.reduce((runeSum, rune) => runeSum + rune.failureCount + rune.criticalFailureCount, 0),
    0,
  );
  const lostMaterialsGp = roundGp(
    entries.reduce(
      (sum, entry) =>
        sum +
        entry.runes.reduce(
          (runeSum, rune) => runeSum + rune.transferCostGp * rune.criticalFailureCount * 0.1,
          0,
        ),
      0,
    ),
  );

  return {
    weaponCount: entries.reduce((sum, entry) => sum + entry.itemQuantity, 0),
    runeCount,
    minimumDays: runeCount,
    retryDays,
    transferCostGp,
    runestoneCostGp,
    lostMaterialsGp,
    grandTotalGp: roundGp(transferCostGp + runestoneCostGp + lostMaterialsGp),
  };
}

function buildRunestoneItemSources(entries: WeaponSelection[], catalog: RuneCatalog): UnknownRecord[] {
  const grouped = new Map<string, { rune: RuneSelection; quantity: number }>();
  for (const entry of entries) {
    for (const rune of entry.runes) {
      const aggregate = grouped.get(rune.key);
      if (aggregate) {
        aggregate.quantity += rune.copies;
      } else {
        grouped.set(rune.key, { rune, quantity: rune.copies });
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
      `<p>Rune value: ${formatGp(rune.priceGp)}. Transfer cost paid: ${formatGp(rune.transferCostGp * aggregate.quantity)}.</p>`,
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
        transferCostGp: rune.transferCostGp * aggregate.quantity,
        quantity: aggregate.quantity,
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
  crafterActor: Actor | null,
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
  source["img"] = SUMMARY_LEDGER_IMAGE;

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
      `<td>${entry.itemQuantity}</td>`,
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
    `<li>Crafter: <strong>${escapeHtml(crafterActor?.name ?? "Unknown")}</strong></li>`,
    `<li>Base transfer time: <strong>${totals.minimumDays}</strong> day(s)</li>`,
    `<li>Retry time from failed checks: <strong>${totals.retryDays}</strong> day(s)</li>`,
    `<li>Total charge: <strong>${formatGp(totals.grandTotalGp)}</strong></li>`,
    `<li>Critical failure material loss: <strong>${formatGp(totals.lostMaterialsGp)}</strong></li>`,
    "</ul>",
    "<table>",
    "<thead>",
    "<tr><th>Item</th><th>Qty</th><th>Type</th><th>Owner</th><th>Runes</th><th>Transfer</th><th>Runestones</th><th>Total</th></tr>",
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
      minimumDays: totals.minimumDays,
      retryDays: totals.retryDays,
      transferCostGp: totals.transferCostGp,
      runestoneCostGp: totals.runestoneCostGp,
      lostMaterialsGp: totals.lostMaterialsGp,
      grandTotalGp: totals.grandTotalGp,
    },
  };
  source["flags"] = flags;

  return source;
}

class RuneStripperApplication extends FormApplication {
  #entries: WeaponSelection[] = [];
  #payerActorId: string | null = null;
  #crafterActorId: string | null = null;
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
      height: 760,
      resizable: true,
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
    const crafterOptions = this.#resolveCrafterOptions();
    const selectedCrafter = this.#getSelectedCrafterActor();
    const crafterInsight = getCrafterInsight(selectedCrafter);

    const selectedPayerName = selectedPayer?.name ?? "None";
    const selectedPayerFundsLabel = availableCopper === null
      ? "Unavailable"
      : formatGp(availableCopper / 100);
    const selectedCrafterName = crafterInsight.actor?.name ?? "None";
    const selectedCrafterModifierLabel = !crafterInsight.actor || !crafterInsight.hasCraftingSkill
      ? "Unavailable"
      : crafterInsight.modifier === null
      ? "Unavailable"
      : `${crafterInsight.modifier >= 0 ? "+" : ""}${crafterInsight.modifier}`;
    const selectedCrafterAssuranceLabel = crafterInsight.assuranceTotal === null
      ? "Not available"
      : `${crafterInsight.assuranceTotal}`;
    const selectedCrafterFeatSummary = crafterInsight.relevantCraftingFeats.length > 0
      ? crafterInsight.relevantCraftingFeats.join(", ")
      : "None detected";
    const craftingRulesSummary =
      "Transfer Rune uses Crafting (1 day per rune, DC by effective item level for each rune, transfer cost 10% of rune Price). " +
      "Critical failures add retry time and lose 10% of transfer materials.";

    const entryViews = this.#entries.map((entry) => {
      const dcValues = Array.from(new Set(entry.runes.map((rune) => rune.transferDc))).sort((a, b) => a - b);
      const craftingDcLabel = dcValues.length === 0
        ? "n/a"
        : dcValues.length === 1
        ? `DC ${dcValues[0]}`
        : `DC ${dcValues[0]}-${dcValues[dcValues.length - 1]}`;

      const successCount = entry.runes.reduce(
        (sum, rune) => sum + getRuneResolvedCopies(rune, crafterInsight),
        0,
      );
      const pendingCount = entry.runes.reduce(
        (sum, rune) => sum + getRunePendingCopies(rune, crafterInsight),
        0,
      );
      const pendingFailures = entry.runes
        .filter((rune) => isFailureOutcome(rune.lastOutcome))
        .reduce((sum, rune) => sum + getRunePendingCopies(rune, crafterInsight), 0);
      const pendingCriticalFailures = entry.runes
        .filter((rune) => rune.lastOutcome === "criticalFailure")
        .reduce((sum, rune) => sum + getRunePendingCopies(rune, crafterInsight), 0);
      const assuranceAutoCount = entry.runes.reduce(
        (sum, rune) => sum + getRuneAssuranceAdditionalCopies(rune, crafterInsight),
        0,
      );

      let craftingStatusLabel = "Ready";
      if (pendingCount > 0) {
        if (!crafterInsight.actor) {
          craftingStatusLabel = "Select crafter";
        } else if (!crafterInsight.hasCraftingSkill) {
          craftingStatusLabel = "Crafter must be trained in Crafting";
        } else if (!crafterInsight.hasMagicalCrafting) {
          craftingStatusLabel = "Magical Crafting required";
        } else if (pendingCriticalFailures > 0) {
          craftingStatusLabel = `${pendingCriticalFailures} critical failure(s) need retry`;
        } else if (pendingFailures > 0) {
          craftingStatusLabel = `${pendingFailures} failure(s) need retry`;
        } else if (assuranceAutoCount > 0) {
          craftingStatusLabel = `${assuranceAutoCount} auto-success, ${pendingCount} pending`;
        } else {
          craftingStatusLabel = `${pendingCount} check(s) pending`;
        }
      } else if (assuranceAutoCount > 0) {
        craftingStatusLabel = `${assuranceAutoCount} auto-success via Assurance`;
      }

      return {
        entryKey: entry.entryKey,
        itemTypeLabel: entry.itemTypeLabel,
        weaponName: entry.weaponName,
        itemQuantityLabel: `x${entry.itemQuantity}`,
        actorName: entry.actorName,
        runeSummary: entry.runeSummary,
        runeCount: entry.runeCount,
        transferCostLabel: formatGp(entry.transferCostGp),
        runestoneCostLabel: formatGp(entry.runestoneCostGp),
        totalCostLabel: formatGp(entry.totalCostGp),
        craftingDcLabel,
        craftingProgressLabel: `${successCount}/${entry.runeCount} resolved`,
        craftingStatusLabel,
        hasRollButton:
          !this.#busy &&
          !!crafterInsight.actor &&
          crafterInsight.hasCraftingSkill &&
          crafterInsight.hasMagicalCrafting &&
          pendingCount > 0,
      };
    });

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
    if (this.#entries.length > 0) {
      if (crafterOptions.length === 0) {
        blockingIssues.push("Select a crafter character with Crafting and Magical Crafting.");
      } else if (!crafterInsight.actor) {
        blockingIssues.push("Select a crafter character for Transfer Rune checks.");
      } else if (!crafterInsight.hasCraftingSkill) {
        blockingIssues.push("Selected crafter is not trained in Crafting.");
      } else if (!crafterInsight.hasMagicalCrafting) {
        blockingIssues.push("Selected crafter needs the Magical Crafting feat to transfer magic runes.");
      } else {
        const pendingRuneCount = this.#entries.reduce(
          (sum, entry) =>
            sum + entry.runes.reduce((entrySum, rune) => entrySum + getRunePendingCopies(rune, crafterInsight), 0),
          0,
        );
        if (pendingRuneCount > 0) {
          blockingIssues.push(
            `${pendingRuneCount} rune transfer check(s) still need results. ` +
              `Use each item's roll button (Assurance auto-successes are already counted).`,
          );
        }
      }
    }
    if (availableCopper !== null && availableCopper < totalCopper) {
      blockingIssues.push(
        `Selected payer has insufficient funds (${formatGp(availableCopper / 100)} available; ` +
          `${formatGp(totals.grandTotalGp)} required).`,
      );
    }

    return {
      entries: entryViews,
      hasEntries: this.#entries.length > 0,
      payerOptions,
      hasPayerOptions: payerOptions.length > 0,
      selectedPayerName,
      selectedPayerFundsLabel,
      crafterOptions,
      hasCrafterOptions: crafterOptions.length > 0,
      selectedCrafterName,
      selectedCrafterModifierLabel,
      selectedCrafterAssuranceLabel,
      selectedCrafterFeatSummary,
      craftingRulesSummary,
      totals: {
        weaponCount: totals.weaponCount,
        runeCount: totals.runeCount,
        minimumDays: totals.minimumDays,
        retryDays: totals.retryDays,
        transferCostLabel: formatGp(totals.transferCostGp),
        runestoneCostLabel: formatGp(totals.runestoneCostGp),
        lostMaterialsLabel: formatGp(totals.lostMaterialsGp),
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

    const registerDropTarget = (target: HTMLElement): void => {
      const setDropActive = (active: boolean): void => {
        target.classList.toggle("is-dragover", active);
      };

      target.addEventListener("dragenter", (event) => {
        event.preventDefault();
        setDropActive(true);
      });

      target.addEventListener("dragover", (event) => {
        event.preventDefault();
        setDropActive(true);
      });

      target.addEventListener("dragleave", (event) => {
        const currentTarget = event.currentTarget;
        if (!(currentTarget instanceof HTMLElement)) {
          setDropActive(false);
          return;
        }
        const related = event.relatedTarget;
        if (related instanceof Node && currentTarget.contains(related)) {
          return;
        }
        setDropActive(false);
      });

      target.addEventListener("drop", (event) => {
        event.preventDefault();
        setDropActive(false);
        void this.#handleDrop(event);
      });
    };

    const dropZone = root.querySelector<HTMLElement>("[data-rune-stripper-dropzone]");
    if (dropZone) {
      registerDropTarget(dropZone);
    }

    for (const target of root.querySelectorAll<HTMLElement>("[data-rune-stripper-drop-target]")) {
      registerDropTarget(target);
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

    html.find<HTMLButtonElement>("button[data-action='roll-crafting']").on("click", (event) => {
      event.preventDefault();
      const button = event.currentTarget;
      const entryKey = button.dataset.entryKey?.trim();
      if (!entryKey) {
        return;
      }
      void this.#rollCraftingForEntry(entryKey);
    });

    html.find<HTMLSelectElement>("select[data-action='payer-select']").on("change", (event) => {
      const selected = (event.currentTarget as HTMLSelectElement).value.trim();
      this.#payerActorId = selected || null;
      this.render();
    });

    html.find<HTMLSelectElement>("select[data-action='crafter-select']").on("change", (event) => {
      const selected = (event.currentTarget as HTMLSelectElement).value.trim();
      this.#crafterActorId = selected || null;
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

    if (!isRunnableStripItem(item)) {
      ui.notifications?.warn(`${CONSTANTS.MODULE_NAME} | Only PF2E weapon or armor items can be stripped.`);
      return;
    }

    const maxQuantity = getItemQuantity(item);
    const quantity = await this.#promptDropQuantity(item, maxQuantity);
    if (quantity === null) {
      return;
    }

    await this.#addWeapon(item, quantity);
  }

  async #promptDropQuantity(item: Item, maxQuantity: number): Promise<number | null> {
    if (maxQuantity <= 1) {
      return 1;
    }

    const inputId = `handy-dandy-rune-stripper-quantity-${foundry.utils.randomID()}`;
    const content = [
      `<form class="standard-form">`,
      `<p>Select how many <strong>${escapeHtml(item.name ?? "item")}</strong> entries to strip.</p>`,
      `<div class="form-group">`,
      `<label for="${inputId}">Quantity</label>`,
      `<input id="${inputId}" type="range" name="quantity" min="1" max="${maxQuantity}" step="1" value="${maxQuantity}" />`,
      `</div>`,
      `<div class="form-group">`,
      `<label for="${inputId}-number">Exact Quantity</label>`,
      `<input id="${inputId}-number" type="number" name="quantityNumber" min="1" max="${maxQuantity}" step="1" value="${maxQuantity}" />`,
      `<p class="hint">Available in stack: ${maxQuantity}</p>`,
      `</div>`,
      `</form>`,
    ].join("");

    const quantity = await waitForDialog<number>({
      title: `${CONSTANTS.MODULE_NAME} | Select Quantity`,
      content,
      width: 420,
      buttons: [
        {
          action: "confirm",
          icon: '<i class="fas fa-check"></i>',
          label: "Add to Queue",
          default: true,
          callback: ({ form }) => {
            const raw = form?.querySelector<HTMLInputElement>("input[name='quantity']")?.value
              ?? form?.querySelector<HTMLInputElement>("input[name='quantityNumber']")?.value
              ?? "";
            const parsed = Math.floor(Number(raw));
            return Math.clamp(Number.isFinite(parsed) ? parsed : maxQuantity, 1, maxQuantity);
          },
        },
        {
          action: "cancel",
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel",
          callback: () => null,
        },
      ],
      render: (root) => {
        const rangeInput = root.querySelector<HTMLInputElement>("input[name='quantity']");
        const numberInput = root.querySelector<HTMLInputElement>("input[name='quantityNumber']");
        if (!rangeInput || !numberInput) {
          return;
        }

        const syncFromRange = (): void => {
          const value = Math.clamp(Math.floor(Number(rangeInput.value) || maxQuantity), 1, maxQuantity);
          numberInput.value = String(value);
        };
        const syncFromNumber = (): void => {
          const value = Math.clamp(Math.floor(Number(numberInput.value) || maxQuantity), 1, maxQuantity);
          rangeInput.value = String(value);
          numberInput.value = String(value);
        };

        rangeInput.addEventListener("input", syncFromRange);
        numberInput.addEventListener("input", syncFromNumber);
      },
      closeResult: null,
    });

    return typeof quantity === "number" ? Math.clamp(Math.floor(quantity), 1, maxQuantity) : null;
  }

  async #addWeapon(item: Item, requestedQuantity?: number): Promise<void> {
    if (!isRunnableStripItem(item)) {
      ui.notifications?.warn(`${CONSTANTS.MODULE_NAME} | Only PF2E weapon or armor items can be stripped.`);
      return;
    }

    const weaponUuid = item.uuid ?? "";
    if (!weaponUuid) {
      ui.notifications?.warn(`${CONSTANTS.MODULE_NAME} | The dropped item is missing a UUID.`);
      return;
    }

    const selection = await this.#buildSelection(item, requestedQuantity);
    if (!selection) {
      ui.notifications?.warn(
        `${CONSTANTS.MODULE_NAME} | ${item.name} has no transferable weapon/armor runes.`,
      );
      return;
    }

    const existingIndex = this.#entries.findIndex((entry) => entry.weaponUuid === weaponUuid);
    if (existingIndex >= 0) {
      this.#mergeCraftingProgress(this.#entries[existingIndex], selection);
      this.#entries[existingIndex] = selection;
    } else {
      this.#entries.push(selection);
    }
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

      const rebuilt = await this.#buildSelection(current, entry.itemQuantity);
      if (!rebuilt) {
        removed.push(entry.weaponName);
        continue;
      }

      this.#mergeCraftingProgress(entry, rebuilt);
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

  async #buildSelection(item: Item, requestedQuantity?: number): Promise<WeaponSelection | null> {
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
    const maxItemQuantity = getItemQuantity(item);
    const itemQuantity = Math.clamp(Math.floor(requestedQuantity ?? maxItemQuantity), 1, maxItemQuantity);
    const itemLevel = getItemLevel(item);

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
        level: catalogEntry.level,
        transferDc: getTransferRuneDc(itemLevel, catalogEntry.level),
        copies: itemQuantity,
        successfulCopies: 0,
        priceGp: roundGp(catalogEntry.priceGp),
        transferCostGp: roundGp(catalogEntry.priceGp * 0.1),
        attempts: 0,
        failureCount: 0,
        criticalFailureCount: 0,
        lastOutcome: null,
        lastRollTotal: null,
        uuid: catalogEntry.uuid,
        img: catalogEntry.img,
      });
    }

    if (selectedRunes.length === 0) {
      return null;
    }

    const transferCostGp = roundGp(selectedRunes.reduce((sum, rune) => sum + rune.transferCostGp * rune.copies, 0));
    const runestoneCostGp = roundGp(
      selectedRunes.reduce((sum, rune) => sum + catalog.runestoneBasePriceGp * rune.copies, 0),
    );
    const totalCostGp = roundGp(transferCostGp + runestoneCostGp);
    const actorName = item.actor?.name?.trim() || "World Item Directory";

    return {
      entryKey: item.uuid,
      itemType,
      itemTypeLabel,
      weaponUuid: item.uuid,
      weaponName,
      itemQuantity,
      actorName,
      runes: selectedRunes,
      unresolved,
      transferCostGp,
      runestoneCostGp,
      totalCostGp,
      runeCount: selectedRunes.reduce((sum, rune) => sum + rune.copies, 0),
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

  #resolveCrafterOptions(): CrafterOption[] {
    const options: CrafterOption[] = [];
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
        if (!isCharacterActor(actor) || !actor.id || seenActorIds.has(actor.id)) {
          continue;
        }
        seenActorIds.add(actor.id);
        options.push({
          actorId: actor.id,
          label: actor.name ?? "Character",
          selected: false,
        });
      }
    } else {
      const preferredCharacter = game.user?.character;
      if (preferredCharacter instanceof Actor && isCharacterActor(preferredCharacter) && preferredCharacter.id) {
        seenActorIds.add(preferredCharacter.id);
        options.push({
          actorId: preferredCharacter.id,
          label: preferredCharacter.name ?? "Character",
          selected: false,
        });
      }

      for (const actor of extractCollectionValues<Actor>(game.actors)) {
        if (!isCharacterActor(actor) || !actor.id || seenActorIds.has(actor.id) || !actor.isOwner) {
          continue;
        }
        seenActorIds.add(actor.id);
        options.push({
          actorId: actor.id,
          label: actor.name ?? "Character",
          selected: false,
        });
      }
    }

    if (options.length === 0) {
      this.#crafterActorId = null;
      return options;
    }

    const preferredActorId = game.user?.character?.id ?? null;
    const hasCurrentSelection = !!this.#crafterActorId && options.some((option) => option.actorId === this.#crafterActorId);
    if (!hasCurrentSelection) {
      this.#crafterActorId =
        (preferredActorId && options.some((option) => option.actorId === preferredActorId))
          ? preferredActorId
          : options[0].actorId;
    }

    return options.map((option) => ({
      ...option,
      selected: option.actorId === this.#crafterActorId,
    }));
  }

  #getSelectedPayerActor(): Actor | null {
    if (!this.#payerActorId) {
      return null;
    }

    return (game.actors?.get(this.#payerActorId) as Actor | null | undefined) ?? null;
  }

  #getSelectedCrafterActor(): Actor | null {
    if (!this.#crafterActorId) {
      return null;
    }

    const actor = (game.actors?.get(this.#crafterActorId) as Actor | null | undefined) ?? null;
    return actor && isCharacterActor(actor) ? actor : null;
  }

  #getPayerAvailableCopper(actor: Actor | null): number | null {
    if (!actor) {
      return null;
    }

    const inventory = (actor as unknown as { inventory?: { currency?: { copperValue?: unknown } } }).inventory;
    const copper = toNumber(inventory?.currency?.copperValue);
    return typeof copper === "number" ? Math.max(Math.floor(copper), 0) : null;
  }

  #mergeCraftingProgress(previous: WeaponSelection, rebuilt: WeaponSelection): void {
    const previousByRuneKey = new Map<string, RuneSelection>();
    for (const rune of previous.runes) {
      previousByRuneKey.set(`${rune.kind}:${rune.key}`, rune);
    }

    for (const rune of rebuilt.runes) {
      const prior = previousByRuneKey.get(`${rune.kind}:${rune.key}`);
      if (!prior) {
        continue;
      }

      rune.attempts = Math.max(Math.trunc(toNumber(prior.attempts) ?? 0), 0);
      rune.failureCount = Math.max(Math.trunc(toNumber(prior.failureCount) ?? 0), 0);
      rune.criticalFailureCount = Math.max(Math.trunc(toNumber(prior.criticalFailureCount) ?? 0), 0);
      rune.successfulCopies = Math.clamp(Math.trunc(toNumber(prior.successfulCopies) ?? 0), 0, rune.copies);
      rune.lastOutcome = prior.lastOutcome;
      rune.lastRollTotal = prior.lastRollTotal;
    }
  }

  async #rollCraftingForEntry(entryKey: string): Promise<void> {
    if (this.#busy) {
      return;
    }

    const entry = this.#entries.find((candidate) => candidate.entryKey === entryKey);
    if (!entry) {
      return;
    }

    const crafterInsight = getCrafterInsight(this.#getSelectedCrafterActor());
    if (!crafterInsight.actor) {
      ui.notifications?.warn(`${CONSTANTS.MODULE_NAME} | Select a crafter before rolling checks.`);
      return;
    }
    if (!crafterInsight.hasCraftingSkill) {
      ui.notifications?.warn(`${CONSTANTS.MODULE_NAME} | Crafter must be trained in Crafting.`);
      return;
    }
    if (!crafterInsight.hasMagicalCrafting) {
      ui.notifications?.warn(
        `${CONSTANTS.MODULE_NAME} | ${crafterInsight.actor.name} needs Magical Crafting to transfer runes.`,
      );
      return;
    }

    const pendingRunes = entry.runes.filter((rune) => isRunePending(rune, crafterInsight));
    if (pendingRunes.length === 0) {
      ui.notifications?.info(`${CONSTANTS.MODULE_NAME} | ${entry.weaponName} already has resolved transfer checks.`);
      return;
    }

    for (const rune of pendingRunes) {
      while (getRunePendingCopies(rune, crafterInsight) > 0) {
        const result = await this.#rollCraftingCheck(entry, rune, crafterInsight.actor);
        if (!result) {
          this.render();
          return;
        }

        rune.attempts += 1;
        rune.lastOutcome = result.outcome;
        rune.lastRollTotal = result.total;

        if (isSuccessfulOutcome(result.outcome)) {
          rune.successfulCopies = Math.min(rune.successfulCopies + 1, rune.copies);
        } else if (result.outcome === "failure") {
          rune.failureCount += 1;
        } else if (result.outcome === "criticalFailure") {
          rune.criticalFailureCount += 1;
        }
      }
    }

    this.render();
  }

  async #rollCraftingCheck(
    entry: WeaponSelection,
    rune: RuneSelection,
    crafter: Actor,
  ): Promise<{ outcome: CraftingOutcome; total: number | null } | null> {
    const skill = getCraftingSkill(crafter);
    const check = asRecord(asRecord(skill)?.["check"]);
    const roll = check?.["roll"];
    if (typeof roll !== "function") {
      ui.notifications?.warn(
        `${CONSTANTS.MODULE_NAME} | Could not resolve a PF2E Crafting roll handler for ${crafter.name}.`,
      );
      return null;
    }

    const rollResult = await (roll as (args: unknown) => Promise<unknown>).call(check, {
      action: "craft",
      slug: "crafting",
      title: `Transfer Rune: ${rune.name} (${entry.weaponName})`,
      dc: { value: rune.transferDc, visible: true },
      extraRollOptions: ["action:craft", "activity:transfer-rune", `${CONSTANTS.MODULE_ID}:rune-stripper`],
    });
    if (!rollResult) {
      return null;
    }

    const rollRecord = asRecord(rollResult);
    const total = toNumber(rollRecord?.["total"]);
    const degree = toNumber(asRecord(rollRecord?.["options"])?.["degreeOfSuccess"]);
    const degreeOutcome = degreeToCraftingOutcome(degree);

    return {
      outcome: degreeOutcome ?? craftingOutcomeFromTotal(total ?? 0, rune.transferDc),
      total,
    };
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
        originalQuantity: getItemQuantity(document),
        originalRunes: extractItemRuneState(document),
      });
    }

    return { targets, missing };
  }

  async #rollbackExecutedStrips(executedTargets: ExecutedStripTarget[]): Promise<string[]> {
    const failures: string[] = [];

    for (const executed of [...executedTargets].reverse()) {
      const { target } = executed;
      try {
        if (executed.mode === "partial") {
          if (executed.splitItemUuid) {
            const splitItem = await fromUuid(executed.splitItemUuid as any);
            if (splitItem instanceof Item) {
              await splitItem.delete();
            }
          }

          await target.document.update({ "system.quantity": target.originalQuantity } as any);
          continue;
        }

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

    const crafterInsight = getCrafterInsight(this.#getSelectedCrafterActor());
    if (!crafterInsight.actor) {
      ui.notifications?.warn(`${CONSTANTS.MODULE_NAME} | Select a crafter before confirming.`);
      return;
    }
    if (!crafterInsight.hasCraftingSkill) {
      ui.notifications?.warn(`${CONSTANTS.MODULE_NAME} | Selected crafter is not trained in Crafting.`);
      return;
    }
    if (!crafterInsight.hasMagicalCrafting) {
      ui.notifications?.warn(
        `${CONSTANTS.MODULE_NAME} | ${crafterInsight.actor.name} needs Magical Crafting to transfer runes.`,
      );
      return;
    }

    const pendingRuneCount = this.#entries.reduce(
      (sum, entry) =>
        sum + entry.runes.reduce((entrySum, rune) => entrySum + getRunePendingCopies(rune, crafterInsight), 0),
      0,
    );
    if (pendingRuneCount > 0) {
      ui.notifications?.warn(
        `${CONSTANTS.MODULE_NAME} | ${pendingRuneCount} rune transfer checks are still unresolved.`,
      );
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
      `<li>Crafter: <strong>${escapeHtml(crafterInsight.actor.name ?? "Unknown")}</strong></li>`,
      `<li>Base transfer time: <strong>${totals.minimumDays}</strong> day(s)</li>`,
      `<li>Retry time from failed checks: <strong>${totals.retryDays}</strong> day(s)</li>`,
      `<li>Transfer cost (RAW 10%): <strong>${formatGp(totals.transferCostGp)}</strong></li>`,
      `<li>Runestone material cost: <strong>${formatGp(totals.runestoneCostGp)}</strong></li>`,
      `<li>Critical failure material loss: <strong>${formatGp(totals.lostMaterialsGp)}</strong></li>`,
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
      await this.#executeStrip(payerActor, catalog, crafterInsight.actor);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ui.notifications?.error(`${CONSTANTS.MODULE_NAME} | Rune stripping failed: ${message}`);
      console.error(`${CONSTANTS.MODULE_NAME} | Rune stripping failed`, error);
    } finally {
      this.#busy = false;
      this.render();
    }
  }

  async #executeStrip(payerActor: Actor, catalog: RuneCatalog, crafterActor: Actor): Promise<void> {
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

    const quantityMismatch = targets.filter((target) => target.entry.itemQuantity > target.originalQuantity);
    if (quantityMismatch.length > 0) {
      const preview = quantityMismatch.map((target) => target.entry.weaponName).slice(0, 5).join(", ");
      const suffix = quantityMismatch.length > 5 ? ` (+${quantityMismatch.length - 5} more)` : "";
      ui.notifications?.warn(
        `${CONSTANTS.MODULE_NAME} | Requested quantity exceeds current stack size for: ${preview}${suffix}. ` +
          `Refresh the queue and try again.`,
      );
      return;
    }

    const executedTargets: ExecutedStripTarget[] = [];
    for (const target of targets) {
      try {
        if (target.entry.itemQuantity < target.originalQuantity) {
          const strippedSource = asRecord(target.document.toObject());
          if (!strippedSource) {
            throw new Error(`Unable to clone "${target.entry.weaponName}" for partial strip.`);
          }
          delete strippedSource["_id"];
          const system = asRecord(strippedSource["system"]) ?? {};
          strippedSource["system"] = system;
          system["quantity"] = target.entry.itemQuantity;
          if (target.entry.itemType === "armor") {
            system["runes"] = {
              potency: 0,
              resilient: 0,
              property: [],
            };
          } else {
            system["runes"] = {
              potency: 0,
              striking: 0,
              property: [],
            };
          }

          const targetActor = target.document.actor;
          let createdSplit: unknown;
          if (targetActor) {
            const createdDocuments = await targetActor.createEmbeddedDocuments("Item", [strippedSource as any]);
            createdSplit = Array.isArray(createdDocuments) ? createdDocuments[0] : null;
          } else {
            createdSplit = await Item.create(strippedSource as any);
          }
          if (!(createdSplit instanceof Item)) {
            throw new Error(`Failed to create stripped split item for "${target.entry.weaponName}".`);
          }

          try {
            await target.document.update({ "system.quantity": target.originalQuantity - target.entry.itemQuantity } as any);
          } catch (error) {
            await createdSplit.delete().catch(() => undefined);
            throw error;
          }

          executedTargets.push({
            target,
            mode: "partial",
            splitItemUuid: createdSplit.uuid ?? undefined,
          });
          continue;
        }

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
        executedTargets.push({ target, mode: "full" });
      } catch {
        const rollbackFailures = await this.#rollbackExecutedStrips(executedTargets);
        const rollbackMessage = rollbackFailures.length > 0
          ? ` Rollback failed for: ${rollbackFailures.join(", ")}.`
          : "";
        throw new Error(
          `Could not strip rune data from "${target.entry.weaponName}". No charges were applied.${rollbackMessage}`,
        );
      }
    }

    const summaryTemplateSource = await getSummaryTemplateSource();
    const summarySource = buildSummaryItemSource(
      this.#entries,
      totals,
      payerActor,
      crafterActor,
      summaryTemplateSource,
    );
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
      const rollbackFailures = await this.#rollbackExecutedStrips(executedTargets);
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
      const rollbackFailures = await this.#rollbackExecutedStrips(executedTargets);
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
        `Charged ${formatGp(totals.grandTotalGp)} to ${payerActor.name}. ` +
        `Crafter: ${crafterActor.name}.`,
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

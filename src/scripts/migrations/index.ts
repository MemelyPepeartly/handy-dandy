import { LATEST_SCHEMA_VERSION, type ActorSchemaData, type ValidatorKey } from "../schemas";

type MutableRecord = Record<string, unknown>;

type MigrationStep = (data: MutableRecord) => MutableRecord;

type MigrationRegistry = Partial<Record<ValidatorKey, Record<number, MigrationStep>>>;

const MIGRATIONS: MigrationRegistry = {
  action: {
    1: withSourceDefault,
    2: upgradeSchemaVersion,
  },
  item: {
    1: withSourceDefault,
    2: upgradeSchemaVersion,
  },
  actor: {
    1: withActorDefaults,
    2: upgradeActorToV3,
  },
  packEntry: {
    1: upgradeSchemaVersion,
    2: upgradeSchemaVersion,
  },
};

export function migrate(
  entityType: ValidatorKey,
  fromVersion: number,
  toVersion: number,
  data: unknown,
): MutableRecord {
  if (fromVersion === toVersion) {
    return cloneRecord(data);
  }

  if (fromVersion > toVersion) {
    throw new Error(
      `Cannot migrate ${entityType} schema backwards from v${fromVersion} to v${toVersion}`,
    );
  }

  let currentVersion = fromVersion;
  let working = cloneRecord(data);

  while (currentVersion < toVersion) {
    const migrationsForType = MIGRATIONS[entityType];
    const step = migrationsForType?.[currentVersion];
    if (!step) {
      throw new Error(
        `No migration registered for ${entityType} schema v${currentVersion} -> v${currentVersion + 1}`,
      );
    }

    working = step(working);
    currentVersion += 1;
  }

  return working;
}

function upgradeSchemaVersion(data: MutableRecord): MutableRecord {
  const next = cloneRecord(data);
  next.schema_version = LATEST_SCHEMA_VERSION;
  return next;
}

function withSourceDefault(data: MutableRecord): MutableRecord {
  const next = upgradeSchemaVersion(data);
  if (typeof next.source !== "string") {
    next.source = "";
  }
  return next;
}

function withActorDefaults(data: MutableRecord): MutableRecord {
  const next = withSourceDefault(data);

  const traits = Array.isArray(next.traits)
    ? next.traits.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
  next.traits = traits.map((value) => value.trim());

  const languages = Array.isArray(next.languages)
    ? next.languages.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
  next.languages = languages.map((value) => value.trim());

  if (typeof next.img === "string") {
    const trimmed = next.img.trim();
    next.img = trimmed.length ? trimmed : null;
  } else {
    next.img = null;
  }

  return next;
}

function upgradeActorToV3(data: MutableRecord): MutableRecord {
  const next = withActorDefaults(data);

  next.size = typeof next.size === "string" && next.size.trim().length > 0 ? next.size.trim() : "med";
  next.alignment = coerceOptionalString(next.alignment);
  next.description = coerceOptionalString(next.description);
  next.recallKnowledge = coerceOptionalString(next.recallKnowledge);

  const level = coercePositiveInteger(next.level) ?? 1;
  const hpValue = Math.max(level * 5, 1);

  next.attributes = {
    hp: { value: hpValue, max: hpValue, temp: 0, details: null },
    ac: { value: 10, details: null },
    perception: { value: 0, details: null, senses: [] },
    speed: { value: 0, details: null, other: [] },
    saves: {
      fortitude: { value: 0, details: null },
      reflex: { value: 0, details: null },
      will: { value: 0, details: null },
    },
    immunities: [],
    weaknesses: [],
    resistances: [],
  } satisfies ActorSchemaData["attributes"];

  next.abilities = {
    str: 0,
    dex: 0,
    con: 0,
    int: 0,
    wis: 0,
    cha: 0,
  } satisfies ActorSchemaData["abilities"];

  next.skills = [] satisfies ActorSchemaData["skills"];
  next.strikes = [] satisfies ActorSchemaData["strikes"];
  next.actions = [] satisfies ActorSchemaData["actions"];

  if (Array.isArray(next.spellcasting)) {
    next.spellcasting = [] satisfies ActorSchemaData["spellcasting"];
  } else {
    delete next.spellcasting;
  }

  return next;
}

function coerceOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function coercePositiveInteger(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.floor(parsed);
    }
  }
  return undefined;
}

function cloneRecord(value: unknown): MutableRecord {
  if (!value || typeof value !== "object") {
    return {};
  }

  return JSON.parse(JSON.stringify(value)) as MutableRecord;
}

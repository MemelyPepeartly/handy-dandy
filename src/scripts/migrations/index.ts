import { LATEST_SCHEMA_VERSION, type ValidatorKey } from "../schemas";

type MutableRecord = Record<string, unknown>;

type MigrationStep = (data: MutableRecord) => MutableRecord;

type MigrationRegistry = Partial<Record<ValidatorKey, Record<number, MigrationStep>>>;

const MIGRATIONS: MigrationRegistry = {
  action: {
    1: withSourceDefault,
  },
  item: {
    1: withSourceDefault,
  },
  actor: {
    1: withSourceDefault,
  },
  packEntry: {
    1: upgradeSchemaVersion,
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

function cloneRecord(value: unknown): MutableRecord {
  if (!value || typeof value !== "object") {
    return {};
  }

  return JSON.parse(JSON.stringify(value)) as MutableRecord;
}

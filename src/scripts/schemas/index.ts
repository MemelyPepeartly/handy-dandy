import Ajv, { JSONSchemaType, ValidateFunction } from "ajv";
import addFormats from "ajv-formats";

export const SYSTEM_IDS = ["pf2e", "sf2e"] as const;
export type SystemId = (typeof SYSTEM_IDS)[number];

export const ACTION_EXECUTIONS = [
  "one-action",
  "two-actions",
  "three-actions",
  "free",
  "reaction"
] as const;
export type ActionExecution = (typeof ACTION_EXECUTIONS)[number];

export const ITEM_CATEGORIES = [
  "armor",
  "weapon",
  "equipment",
  "consumable",
  "feat",
  "spell",
  "wand",
  "staff",
  "other"
] as const;
export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

export const ACTOR_CATEGORIES = [
  "character",
  "npc",
  "hazard",
  "vehicle",
  "familiar"
] as const;
export type ActorCategory = (typeof ACTOR_CATEGORIES)[number];

export const RARITIES = ["common", "uncommon", "rare", "unique"] as const;
export type Rarity = (typeof RARITIES)[number];

export const ENTITY_TYPES = ["action", "item", "actor"] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const LATEST_SCHEMA_VERSION = 2 as const;

type BaseEntity<TType extends EntityType> = {
  schema_version: typeof LATEST_SCHEMA_VERSION;
  systemId: SystemId;
  type: TType;
  slug: string;
  name: string;
};

export interface ActionSchemaData extends BaseEntity<"action"> {
  actionType: ActionExecution;
  traits?: string[] | null;
  requirements?: string | null;
  description: string;
  img?: string | null;
  rarity?: Rarity | null;
  source?: string | null;
}

export interface ItemSchemaData extends BaseEntity<"item"> {
  itemType: ItemCategory;
  rarity: Rarity;
  level: number;
  price?: number | null;
  traits?: string[] | null;
  description?: string | null;
  img?: string | null;
  source?: string | null;
}

export interface ActorSchemaData extends BaseEntity<"actor"> {
  actorType: ActorCategory;
  rarity: Rarity;
  level: number;
  traits?: string[] | null;
  languages?: string[] | null;
  img?: string | null;
  source?: string | null;
}

export interface PackEntrySchemaData {
  schema_version: typeof LATEST_SCHEMA_VERSION;
  systemId: SystemId;
  id: string;
  entityType: EntityType;
  name: string;
  slug: string;
  img?: string | null;
  sort?: number | null;
  folder?: string | null;
}

const baseMeta = {
  schema_version: {
    type: "integer",
    enum: [LATEST_SCHEMA_VERSION],
    default: LATEST_SCHEMA_VERSION,
  },
  systemId: { type: "string", enum: SYSTEM_IDS, default: "pf2e" as const },
  slug: { type: "string", minLength: 1 },
  name: { type: "string", minLength: 1 }
} as const;

export const actionSchema = {
  $id: "Action",
  type: "object",
  additionalProperties: false,
  required: ["schema_version", "systemId", "type", "slug", "name", "actionType", "description"],
  properties: {
    ...baseMeta,
    type: { type: "string", enum: ["action"] as const },
    actionType: { type: "string", enum: ACTION_EXECUTIONS },
    traits: {
      type: "array",
      items: { type: "string", minLength: 1 },
      nullable: true,
      default: [] as const
    },
    requirements: { type: "string", nullable: true, default: "" },
    description: { type: "string", minLength: 1 },
    img: { type: "string", format: "uri-reference", nullable: true, default: "" },
    rarity: { type: "string", enum: RARITIES, nullable: true, default: "common" as const },
    source: { type: "string", nullable: true, default: "" }
  }
} satisfies JSONSchemaType<ActionSchemaData>;

export const itemSchema = {
  $id: "Item",
  type: "object",
  additionalProperties: false,
  required: ["schema_version", "systemId", "type", "slug", "name", "itemType", "rarity", "level"],
  properties: {
    ...baseMeta,
    type: { type: "string", enum: ["item"] as const },
    itemType: { type: "string", enum: ITEM_CATEGORIES },
    rarity: { type: "string", enum: RARITIES },
    level: { type: "integer", minimum: 0 },
    price: { type: "number", minimum: 0, nullable: true, default: 0 },
    traits: {
      type: "array",
      items: { type: "string", minLength: 1 },
      nullable: true,
      default: [] as const
    },
    description: { type: "string", nullable: true, default: "" },
    img: { type: "string", format: "uri-reference", nullable: true, default: "" },
    source: { type: "string", nullable: true, default: "" }
  }
} satisfies JSONSchemaType<ItemSchemaData>;

export const actorSchema = {
  $id: "Actor",
  type: "object",
  additionalProperties: false,
  required: ["schema_version", "systemId", "type", "slug", "name", "actorType", "rarity", "level"],
  properties: {
    ...baseMeta,
    type: { type: "string", enum: ["actor"] as const },
    actorType: { type: "string", enum: ACTOR_CATEGORIES },
    rarity: { type: "string", enum: RARITIES },
    level: { type: "integer", minimum: 0 },
    traits: {
      type: "array",
      items: { type: "string", minLength: 1 },
      nullable: true,
      default: [] as const
    },
    languages: {
      type: "array",
      items: { type: "string", minLength: 1 },
      nullable: true,
      default: [] as const
    },
    img: { type: "string", format: "uri-reference", nullable: true, default: "" },
    source: { type: "string", nullable: true, default: "" }
  }
} satisfies JSONSchemaType<ActorSchemaData>;

export const packEntrySchema = {
  $id: "PackEntry",
  type: "object",
  additionalProperties: false,
  required: ["schema_version", "systemId", "id", "entityType", "name", "slug"],
  properties: {
    schema_version: baseMeta.schema_version,
    systemId: baseMeta.systemId,
    id: { type: "string", minLength: 1 },
    entityType: { type: "string", enum: ENTITY_TYPES },
    name: baseMeta.name,
    slug: baseMeta.slug,
    img: { type: "string", format: "uri-reference", nullable: true, default: "" },
    sort: { type: "integer", nullable: true, default: 0 },
    folder: { type: "string", nullable: true, default: null }
  }
} satisfies JSONSchemaType<PackEntrySchemaData>;

export const schemas = {
  action: actionSchema,
  item: itemSchema,
  actor: actorSchema,
  packEntry: packEntrySchema
} as const;

export type SchemaMap = typeof schemas;

const ajv = new Ajv({
  strict: true,
  allErrors: true,
  useDefaults: true
});
addFormats(ajv);

export const validators: {
  [K in keyof SchemaMap]: ValidateFunction<
    K extends "action"
      ? ActionSchemaData
      : K extends "item"
        ? ItemSchemaData
        : K extends "actor"
          ? ActorSchemaData
          : PackEntrySchemaData
  >;
} = {
  action: ajv.compile<ActionSchemaData>(actionSchema),
  item: ajv.compile<ItemSchemaData>(itemSchema),
  actor: ajv.compile<ActorSchemaData>(actorSchema),
  packEntry: ajv.compile<PackEntrySchemaData>(packEntrySchema)
};

export type ValidatorMap = typeof validators;
export type ValidatorKey = keyof ValidatorMap;
export type EntityValidator = ValidatorMap[keyof ValidatorMap];

export type CanonicalEntityMap = {
  action: ActionSchemaData;
  item: ItemSchemaData;
  actor: ActorSchemaData;
};

export type SchemaDataFor<K extends ValidatorKey> = K extends "action"
  ? ActionSchemaData
  : K extends "item"
    ? ItemSchemaData
    : K extends "actor"
      ? ActorSchemaData
      : PackEntrySchemaData;

export { ajv as ajvInstance };

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

export const ACTOR_SIZES = ["tiny", "sm", "med", "lg", "huge", "grg"] as const;
export type ActorSize = (typeof ACTOR_SIZES)[number];

export const RARITIES = ["common", "uncommon", "rare", "unique"] as const;
export type Rarity = (typeof RARITIES)[number];

export const ENTITY_TYPES = ["action", "item", "actor"] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const LATEST_SCHEMA_VERSION = 3 as const;

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

export interface ActorHitPointsData {
  value: number;
  max: number;
  temp?: number | null;
  details?: string | null;
}

export interface ActorArmorClassData {
  value: number;
  details?: string | null;
}

export interface ActorPerceptionData {
  value: number;
  details?: string | null;
  senses?: string[] | null;
}

export interface ActorSpeedValue {
  type: string;
  value: number;
  details?: string | null;
}

export interface ActorSpeedData {
  value: number;
  details?: string | null;
  other?: ActorSpeedValue[] | null;
}

export interface ActorImmunityData {
  type: string;
  exceptions?: string[] | null;
  details?: string | null;
}

export interface ActorWeaknessData {
  type: string;
  value: number;
  exceptions?: string[] | null;
  details?: string | null;
}

export interface ActorResistanceData {
  type: string;
  value: number;
  exceptions?: string[] | null;
  doubleVs?: string[] | null;
  details?: string | null;
}

export interface ActorSaveData {
  value: number;
  details?: string | null;
}

export interface ActorSavesData {
  fortitude: ActorSaveData;
  reflex: ActorSaveData;
  will: ActorSaveData;
}

export interface ActorAbilityScores {
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
}

export interface ActorSkillData {
  slug: string;
  modifier: number;
  details?: string | null;
}

export interface ActorStrikeDamageData {
  formula: string;
  damageType?: string | null;
  notes?: string | null;
}

export interface ActorStrikeData {
  name: string;
  type: "melee" | "ranged";
  attackBonus: number;
  traits?: string[] | null;
  damage: ActorStrikeDamageData[];
  effects?: string[] | null;
  description?: string | null;
}

export type ActorActionCost =
  | "one-action"
  | "two-actions"
  | "three-actions"
  | "free"
  | "reaction"
  | "passive";

export interface ActorActionData {
  name: string;
  actionCost: ActorActionCost;
  description: string;
  traits?: string[] | null;
  requirements?: string | null;
  trigger?: string | null;
  frequency?: string | null;
}

export type SpellcastingCategory =
  | "prepared"
  | "spontaneous"
  | "innate"
  | "focus"
  | "ritual";

export interface ActorSpellData {
  level: number;
  name: string;
  description?: string | null;
  tradition?: string | null;
}

export interface ActorSpellcastingEntryData {
  name: string;
  tradition: string;
  castingType: SpellcastingCategory;
  attackBonus?: number | null;
  saveDC?: number | null;
  notes?: string | null;
  spells: ActorSpellData[];
}

export interface ActorAttributeBlock {
  hp: ActorHitPointsData;
  ac: ActorArmorClassData;
  perception: ActorPerceptionData;
  speed: ActorSpeedData;
  saves: ActorSavesData;
  immunities?: ActorImmunityData[] | null;
  weaknesses?: ActorWeaknessData[] | null;
  resistances?: ActorResistanceData[] | null;
}

export interface ActorSchemaData extends BaseEntity<"actor"> {
  actorType: ActorCategory;
  rarity: Rarity;
  level: number;
  size: ActorSize;
  traits: string[];
  alignment?: string | null;
  languages: string[];
  attributes: ActorAttributeBlock;
  abilities: ActorAbilityScores;
  skills: ActorSkillData[];
  strikes: ActorStrikeData[];
  actions: ActorActionData[];
  spellcasting?: ActorSpellcastingEntryData[] | null;
  description?: string | null;
  recallKnowledge?: string | null;
  img: string | null;
  source: string;
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
    img: { type: "string", nullable: true, default: null },
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
    img: { type: "string", nullable: true, default: null },
    source: { type: "string", nullable: true, default: "" }
  }
} satisfies JSONSchemaType<ItemSchemaData>;

export const actorSchema = {
  $id: "Actor",
  type: "object",
  additionalProperties: false,
  required: [
    "schema_version",
    "systemId",
    "type",
    "slug",
    "name",
    "actorType",
    "rarity",
    "level",
    "size",
    "traits",
    "languages",
    "attributes",
    "abilities",
    "skills",
    "strikes",
    "actions",
    "img",
    "source"
  ],
  properties: {
    ...baseMeta,
    type: { type: "string", enum: ["actor"] as const },
    actorType: { type: "string", enum: ACTOR_CATEGORIES },
    rarity: { type: "string", enum: RARITIES },
    level: { type: "integer", minimum: 0 },
    size: { type: "string", enum: ACTOR_SIZES },
    traits: {
      type: "array",
      items: { type: "string", minLength: 1 },
      default: [] as const
    },
    alignment: { type: "string", nullable: true, default: null },
    languages: {
      type: "array",
      items: { type: "string", minLength: 1 },
      default: [] as const
    },
    attributes: {
      type: "object",
      additionalProperties: false,
      required: ["hp", "ac", "perception", "speed", "saves"],
      properties: {
        hp: {
          type: "object",
          additionalProperties: false,
          required: ["value", "max"],
          properties: {
            value: { type: "integer", minimum: 0 },
            max: { type: "integer", minimum: 0 },
            temp: { type: "integer", nullable: true, default: 0 },
            details: { type: "string", nullable: true, default: null }
          }
        },
        ac: {
          type: "object",
          additionalProperties: false,
          required: ["value"],
          properties: {
            value: { type: "integer" },
            details: { type: "string", nullable: true, default: null }
          }
        },
        perception: {
          type: "object",
          additionalProperties: false,
          required: ["value"],
          properties: {
            value: { type: "integer" },
            details: { type: "string", nullable: true, default: null },
            senses: {
              type: "array",
              items: { type: "string", minLength: 1 },
              nullable: true,
              default: [] as const
            }
          }
        },
        speed: {
          type: "object",
          additionalProperties: false,
          required: ["value"],
          properties: {
            value: { type: "integer", minimum: 0 },
            details: { type: "string", nullable: true, default: null },
            other: {
              type: "array",
              nullable: true,
              default: [] as const,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["type", "value"],
                properties: {
                  type: { type: "string", minLength: 1 },
                  value: { type: "integer", minimum: 0 },
                  details: { type: "string", nullable: true, default: null }
                }
              }
            }
          }
        },
        saves: {
          type: "object",
          additionalProperties: false,
          required: ["fortitude", "reflex", "will"],
          properties: {
            fortitude: {
              type: "object",
              additionalProperties: false,
              required: ["value"],
              properties: {
                value: { type: "integer" },
                details: { type: "string", nullable: true, default: null }
              }
            },
            reflex: {
              type: "object",
              additionalProperties: false,
              required: ["value"],
              properties: {
                value: { type: "integer" },
                details: { type: "string", nullable: true, default: null }
              }
            },
            will: {
              type: "object",
              additionalProperties: false,
              required: ["value"],
              properties: {
                value: { type: "integer" },
                details: { type: "string", nullable: true, default: null }
              }
            }
          }
        },
        immunities: {
          type: "array",
          nullable: true,
          default: [] as const,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["type"],
            properties: {
              type: { type: "string", minLength: 1 },
              exceptions: {
                type: "array",
                nullable: true,
                default: [] as const,
                items: { type: "string", minLength: 1 }
              },
              details: { type: "string", nullable: true, default: null }
            }
          }
        },
        weaknesses: {
          type: "array",
          nullable: true,
          default: [] as const,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["type", "value"],
            properties: {
              type: { type: "string", minLength: 1 },
              value: { type: "integer", minimum: 0 },
              exceptions: {
                type: "array",
                nullable: true,
                default: [] as const,
                items: { type: "string", minLength: 1 }
              },
              details: { type: "string", nullable: true, default: null }
            }
          }
        },
        resistances: {
          type: "array",
          nullable: true,
          default: [] as const,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["type", "value"],
            properties: {
              type: { type: "string", minLength: 1 },
              value: { type: "integer", minimum: 0 },
              exceptions: {
                type: "array",
                nullable: true,
                default: [] as const,
                items: { type: "string", minLength: 1 }
              },
              doubleVs: {
                type: "array",
                nullable: true,
                default: [] as const,
                items: { type: "string", minLength: 1 }
              },
              details: { type: "string", nullable: true, default: null }
            }
          }
        }
      }
    },
    abilities: {
      type: "object",
      additionalProperties: false,
      required: ["str", "dex", "con", "int", "wis", "cha"],
      properties: {
        str: { type: "integer" },
        dex: { type: "integer" },
        con: { type: "integer" },
        int: { type: "integer" },
        wis: { type: "integer" },
        cha: { type: "integer" }
      }
    },
    skills: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["slug", "modifier"],
        properties: {
          slug: { type: "string", minLength: 1 },
          modifier: { type: "integer" },
          details: { type: "string", nullable: true, default: null }
        }
      },
      default: [] as const
    },
    strikes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "type", "attackBonus", "damage"],
        properties: {
          name: { type: "string", minLength: 1 },
          type: { type: "string", enum: ["melee", "ranged"] as const },
          attackBonus: { type: "integer" },
          traits: {
            type: "array",
            nullable: true,
            default: [] as const,
            items: { type: "string", minLength: 1 }
          },
          damage: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["formula"],
              properties: {
                formula: { type: "string", minLength: 1 },
                damageType: { type: "string", nullable: true, default: null },
                notes: { type: "string", nullable: true, default: null }
              }
            }
          },
          effects: {
            type: "array",
            nullable: true,
            default: [] as const,
            items: { type: "string", minLength: 1 }
          },
          description: { type: "string", nullable: true, default: null }
        }
      },
      default: [] as const
    },
    actions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "actionCost", "description"],
        properties: {
          name: { type: "string", minLength: 1 },
          actionCost: {
            type: "string",
            enum: ["one-action", "two-actions", "three-actions", "free", "reaction", "passive"] as const
          },
          description: { type: "string", minLength: 1 },
          traits: {
            type: "array",
            nullable: true,
            default: [] as const,
            items: { type: "string", minLength: 1 }
          },
          requirements: { type: "string", nullable: true, default: null },
          trigger: { type: "string", nullable: true, default: null },
          frequency: { type: "string", nullable: true, default: null }
        }
      },
      default: [] as const
    },
    spellcasting: {
      type: "array",
      nullable: true,
      default: [] as const,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "tradition", "castingType", "spells"],
        properties: {
          name: { type: "string", minLength: 1 },
          tradition: { type: "string", minLength: 1 },
          castingType: {
            type: "string",
            enum: ["prepared", "spontaneous", "innate", "focus", "ritual"] as const
          },
          attackBonus: { type: "integer", nullable: true, default: null },
          saveDC: { type: "integer", nullable: true, default: null },
          notes: { type: "string", nullable: true, default: null },
          spells: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["level", "name"],
              properties: {
                level: { type: "integer", minimum: 0 },
                name: { type: "string", minLength: 1 },
                description: { type: "string", nullable: true, default: null },
                tradition: { type: "string", nullable: true, default: null }
              }
            }
          }
        }
      }
    },
    description: { type: "string", nullable: true, default: null },
    recallKnowledge: { type: "string", nullable: true, default: null },
    img: { type: "string", nullable: true, default: null },
    source: { type: "string", default: "" }
  }
} as unknown as JSONSchemaType<ActorSchemaData>;

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
    img: { type: "string", nullable: true, default: null },
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

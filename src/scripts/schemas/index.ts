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
  "ammo",
  "armor",
  "shield",
  "weapon",
  "equipment",
  "backpack",
  "book",
  "consumable",
  "treasure",
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
  "loot",
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

export interface PublicationData {
  title: string;
  authors: string;
  license: string;
  remaster: boolean;
}

export const PUBLICATION_DEFAULT = {
  title: "",
  authors: "",
  license: "OGL",
  remaster: false,
} as const satisfies PublicationData;

const publicationSchema: JSONSchemaType<PublicationData> = {
  type: "object",
  additionalProperties: false,
  required: ["title", "authors", "license", "remaster"],
  properties: {
    title: { type: "string", default: PUBLICATION_DEFAULT.title },
    authors: { type: "string", default: PUBLICATION_DEFAULT.authors },
    license: { type: "string", default: PUBLICATION_DEFAULT.license },
    remaster: { type: "boolean", default: PUBLICATION_DEFAULT.remaster },
  },
  default: PUBLICATION_DEFAULT,
};

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
  publication: PublicationData;
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
  system?: Record<string, unknown> | null;
  publication: PublicationData;
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
  system?: Record<string, unknown> | null;
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

export interface ActorInventoryEntryData {
  name: string;
  itemType?: ItemCategory | null;
  slug?: string | null;
  quantity?: number | null;
  level?: number | null;
  description?: string | null;
  img?: string | null;
  system?: Record<string, unknown> | null;
}

export interface ActorLootSheetData {
  lootSheetType?: "Loot" | "Merchant" | null;
  hiddenWhenEmpty?: boolean | null;
}

export interface ActorHazardSheetData {
  isComplex?: boolean | null;
  disable?: string | null;
  routine?: string | null;
  reset?: string | null;
  emitsSound?: boolean | "encounter" | null;
  hardness?: number | null;
  stealthBonus?: number | null;
  stealthDetails?: string | null;
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
  inventory?: ActorInventoryEntryData[] | null;
  loot?: ActorLootSheetData | null;
  hazard?: ActorHazardSheetData | null;
  description?: string | null;
  recallKnowledge?: string | null;
  img: string | null;
  source: string;
  publication: PublicationData;
}

export interface ActorGenerationResult {
  schema_version: typeof LATEST_SCHEMA_VERSION;
  systemId: SystemId;
  slug: string;
  name: string;
  type: ActorCategory;
  img: string;
  system: Record<string, unknown>;
  prototypeToken: Record<string, unknown>;
  items: Record<string, unknown>[];
  effects: unknown[];
  folder: string | null;
  flags: Record<string, unknown>;
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
  required: [
    "schema_version",
    "systemId",
    "type",
    "slug",
    "name",
    "actionType",
    "description",
    "publication",
  ],
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
    source: { type: "string", nullable: true, default: "" },
    publication: publicationSchema
  }
} satisfies JSONSchemaType<ActionSchemaData>;

export const itemSchema = {
  $id: "Item",
  type: "object",
  additionalProperties: false,
  required: [
    "schema_version",
    "systemId",
    "type",
    "slug",
    "name",
    "itemType",
    "rarity",
    "level",
    "publication",
  ],
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
    source: { type: "string", nullable: true, default: "" },
    system: {
      type: "object",
      nullable: true,
      default: null,
      additionalProperties: true,
      required: [],
      properties: {},
    },
    publication: publicationSchema
  }
} satisfies JSONSchemaType<ItemSchemaData>;

const INVENTORY_GENERIC_ITEM_CATEGORIES = [
  "ammo",
  "equipment",
  "backpack",
  "book",
  "consumable",
  "treasure",
  "feat",
  "spell",
  "wand",
  "staff",
  "other",
] as const;

const genericStringValueSchema = {
  type: "object",
  additionalProperties: false,
  required: [],
  properties: {
    value: { type: "string", default: "" },
  },
} as const;

const genericCurrencySchema = {
  type: "object",
  additionalProperties: false,
  required: [],
  properties: {
    pp: { type: "integer", minimum: 0, default: 0 },
    gp: { type: "integer", minimum: 0, default: 0 },
    sp: { type: "integer", minimum: 0, default: 0 },
    cp: { type: "integer", minimum: 0, default: 0 },
  },
} as const;

const genericTraitsSchema = {
  type: "object",
  additionalProperties: false,
  required: [],
  properties: {
    value: {
      type: "array",
      default: [] as const,
      items: { type: "string", minLength: 1 },
    },
    otherTags: {
      type: "array",
      default: [] as const,
      items: { type: "string", minLength: 1 },
    },
    rarity: { type: "string", enum: RARITIES, default: "common" as const },
    traditions: {
      type: "array",
      default: [] as const,
      items: { type: "string", minLength: 1 },
    },
  },
} as const;

const genericPhysicalSystemSchema = {
  type: "object",
  additionalProperties: false,
  required: [],
  properties: {
    quantity: { type: "integer", minimum: 1, default: 1 },
    usage: {
      type: "object",
      additionalProperties: false,
      required: [],
      properties: {
        value: { type: "string", default: "" },
      },
    },
    bulk: {
      type: "object",
      additionalProperties: false,
      required: [],
      properties: {
        value: { type: "number", minimum: 0, default: 0 },
        heldOrStowed: { type: "number", minimum: 0, default: 0 },
        capacity: { type: "integer", minimum: 0, default: 0 },
        ignored: { type: "integer", minimum: 0, default: 0 },
        per: { type: "integer", minimum: 1, default: 1 },
      },
    },
    size: { type: "string", enum: ACTOR_SIZES, default: "med" as const },
    price: {
      type: "object",
      additionalProperties: false,
      required: [],
      properties: {
        value: genericCurrencySchema,
        per: { type: "integer", minimum: 1, default: 1 },
        sizeSensitive: { type: "boolean", default: false },
      },
    },
    hp: {
      type: "object",
      additionalProperties: false,
      required: [],
      properties: {
        value: { type: "integer", minimum: 0, default: 0 },
        max: { type: "integer", minimum: 0, default: 0 },
      },
    },
    hardness: { type: "integer", minimum: 0, default: 0 },
    traits: genericTraitsSchema,
    equipped: {
      type: "object",
      additionalProperties: false,
      required: [],
      properties: {
        carryType: { type: "string", default: "worn" },
        invested: { type: "boolean", nullable: true, default: null },
        handsHeld: { type: "integer", minimum: 0, maximum: 2, nullable: true, default: null },
        inSlot: { type: "boolean", nullable: true, default: null },
      },
    },
    material: {
      type: "object",
      additionalProperties: false,
      required: [],
      properties: {
        type: { type: "string", nullable: true, default: null },
        grade: { type: "string", nullable: true, default: null },
      },
    },
    identification: {
      type: "object",
      additionalProperties: false,
      required: [],
      properties: {
        status: { type: "string", enum: ["identified", "unidentified"] as const, default: "identified" as const },
        unidentified: {
          type: "object",
          additionalProperties: false,
          required: [],
          properties: {
            name: { type: "string", default: "" },
            img: { type: "string", default: "" },
            data: {
              type: "object",
              additionalProperties: false,
              required: [],
              properties: {
                description: {
                  type: "object",
                  additionalProperties: false,
                  required: [],
                  properties: {
                    value: { type: "string", default: "" },
                  },
                },
              },
            },
          },
        },
      },
    },
    baseItem: { type: "string", nullable: true, default: null },
    containerId: { type: "string", nullable: true, default: null },
    category: { type: "string", nullable: true, default: null },
    subitems: {
      type: "array",
      default: [] as const,
      items: {
        type: "object",
        additionalProperties: false,
        required: [],
        properties: {},
      },
    },
  },
} as const;

const weaponInventorySystemSchema = {
  ...genericPhysicalSystemSchema,
  properties: {
    ...genericPhysicalSystemSchema.properties,
    category: { type: "string", default: "simple" },
    group: { type: "string", nullable: true, default: null },
    bonus: {
      type: "object",
      additionalProperties: false,
      required: [],
      properties: {
        value: { type: "integer", default: 0 },
      },
    },
    damage: {
      type: "object",
      additionalProperties: false,
      required: [],
      properties: {
        dice: { type: "integer", minimum: 0, default: 1 },
        die: { type: "string", enum: ["d4", "d6", "d8", "d10", "d12"] as const, nullable: true, default: "d4" as const },
        damageType: { type: "string", nullable: true, default: "bludgeoning" },
        modifier: { type: "integer", default: 0 },
        persistent: {
          type: "object",
          nullable: true,
          default: null,
          additionalProperties: false,
          required: [],
          properties: {
            number: { type: "integer", minimum: 0, default: 0 },
            faces: { type: "integer", enum: [4, 6, 8, 10, 12] as const, nullable: true, default: null },
            type: { type: "string", nullable: true, default: null },
          },
        },
      },
    },
    splashDamage: {
      type: "object",
      additionalProperties: false,
      required: [],
      properties: {
        value: { type: "integer", minimum: 0, default: 0 },
      },
    },
    range: { type: "integer", minimum: 0, nullable: true, default: null },
    maxRange: { type: "integer", minimum: 0, nullable: true, default: null },
    expend: { type: "integer", minimum: 0, nullable: true, default: null },
    reload: {
      type: "object",
      additionalProperties: false,
      required: [],
      properties: {
        value: { type: "string", nullable: true, default: "0" },
      },
    },
    ammo: {
      type: "object",
      nullable: true,
      default: null,
      additionalProperties: false,
      required: [],
      properties: {
        builtIn: { type: "boolean", default: false },
        baseType: { type: "string", nullable: true, default: null },
        capacity: { type: "integer", minimum: 0, nullable: true, default: null },
      },
    },
    selectedAmmoId: { type: "string", nullable: true, default: null },
    grade: { type: "string", nullable: true, default: null },
    runes: {
      type: "object",
      additionalProperties: false,
      required: [],
      properties: {
        potency: { type: "integer", minimum: 0, maximum: 4, default: 0 },
        striking: { type: "integer", minimum: 0, maximum: 4, default: 0 },
        property: {
          type: "array",
          default: [] as const,
          items: { type: "string", minLength: 1 },
        },
      },
    },
    specific: {
      type: "object",
      nullable: true,
      default: null,
      additionalProperties: false,
      required: [],
      properties: {},
    },
  },
} as const;

const armorInventorySystemSchema = {
  ...genericPhysicalSystemSchema,
  properties: {
    ...genericPhysicalSystemSchema.properties,
    category: { type: "string", default: "light" },
    group: { type: "string", nullable: true, default: null },
    acBonus: { type: "integer", minimum: 0, default: 0 },
    strength: { type: "integer", nullable: true, default: null },
    dexCap: { type: "integer", minimum: 0, default: 5 },
    checkPenalty: { type: "integer", default: 0 },
    speedPenalty: { type: "integer", default: 0 },
    grade: { type: "string", nullable: true, default: null },
    runes: {
      type: "object",
      additionalProperties: false,
      required: [],
      properties: {
        potency: { type: "integer", minimum: 0, maximum: 4, default: 0 },
        resilient: { type: "integer", minimum: 0, maximum: 4, default: 0 },
        property: {
          type: "array",
          default: [] as const,
          items: { type: "string", minLength: 1 },
        },
      },
    },
    specific: {
      type: "object",
      nullable: true,
      default: null,
      additionalProperties: false,
      required: [],
      properties: {},
    },
  },
} as const;

const shieldInventorySystemSchema = {
  ...genericPhysicalSystemSchema,
  properties: {
    ...genericPhysicalSystemSchema.properties,
    baseItem: { type: "string", nullable: true, default: null },
    acBonus: { type: "integer", minimum: 0, default: 2 },
    speedPenalty: { type: "integer", default: 0 },
    grade: { type: "string", nullable: true, default: null },
    runes: {
      type: "object",
      additionalProperties: false,
      required: [],
      properties: {
        reinforcing: { type: "integer", minimum: 0, maximum: 4, default: 0 },
      },
    },
    specific: {
      type: "object",
      nullable: true,
      default: null,
      additionalProperties: false,
      required: [],
      properties: {},
    },
  },
} as const;

const actorInventoryBaseProperties = {
  name: { type: "string", minLength: 1 },
  slug: { type: "string", nullable: true, default: null },
  quantity: { type: "integer", minimum: 1, nullable: true, default: 1 },
  level: { type: "integer", minimum: 0, nullable: true, default: null },
  description: { type: "string", nullable: true, default: null },
  img: { type: "string", nullable: true, default: null },
} as const;

const actorInventoryEntryVariantSchemas = [
  {
    type: "object",
    additionalProperties: false,
    required: ["name", "itemType", "system"],
    properties: {
      ...actorInventoryBaseProperties,
      itemType: { type: "string", enum: ["weapon"] as const, default: "weapon" as const },
      system: {
        ...weaponInventorySystemSchema,
        default: {},
      },
    },
  },
  {
    type: "object",
    additionalProperties: false,
    required: ["name", "itemType", "system"],
    properties: {
      ...actorInventoryBaseProperties,
      itemType: { type: "string", enum: ["armor"] as const, default: "armor" as const },
      system: {
        ...armorInventorySystemSchema,
        default: {},
      },
    },
  },
  {
    type: "object",
    additionalProperties: false,
    required: ["name", "itemType", "system"],
    properties: {
      ...actorInventoryBaseProperties,
      itemType: { type: "string", enum: ["shield"] as const, default: "shield" as const },
      system: {
        ...shieldInventorySystemSchema,
        default: {},
      },
    },
  },
  {
    type: "object",
    additionalProperties: false,
    required: ["name"],
    properties: {
      ...actorInventoryBaseProperties,
      itemType: { type: "string", enum: INVENTORY_GENERIC_ITEM_CATEGORIES, nullable: true, default: null },
      system: {
        ...genericPhysicalSystemSchema,
        nullable: true,
        default: null,
      },
    },
  },
] as const;

const actorSpellSystemSchema = {
  type: "object",
  additionalProperties: false,
  required: [],
  properties: {
    time: genericStringValueSchema,
    range: genericStringValueSchema,
    target: genericStringValueSchema,
    area: {
      type: "object",
      nullable: true,
      default: null,
      additionalProperties: false,
      required: [],
      properties: {
        value: { type: "integer", minimum: 0, nullable: true, default: null },
        type: { type: "string", nullable: true, default: null },
      },
    },
    duration: {
      type: "object",
      additionalProperties: false,
      required: [],
      properties: {
        value: { type: "string", default: "" },
        sustained: { type: "boolean", default: false },
      },
    },
    defense: {
      type: "object",
      nullable: true,
      default: null,
      additionalProperties: false,
      required: [],
      properties: {
        passive: {
          type: "object",
          additionalProperties: false,
          required: [],
          properties: {
            statistic: { type: "string", default: "" },
          },
        },
        save: {
          type: "object",
          additionalProperties: false,
          required: [],
          properties: {
            statistic: { type: "string", default: "" },
            basic: { type: "boolean", default: false },
          },
        },
      },
    },
    damage: {
      type: "object",
      nullable: true,
      default: null,
      additionalProperties: false,
      required: [],
      properties: {
        formula: { type: "string", nullable: true, default: null },
        type: { type: "string", nullable: true, default: null },
        kind: { type: "string", nullable: true, default: null },
      },
    },
    heightening: {
      type: "object",
      nullable: true,
      default: null,
      additionalProperties: false,
      required: [],
      properties: {
        type: { type: "string", nullable: true, default: null },
        interval: { type: "integer", minimum: 1, nullable: true, default: null },
      },
    },
    traits: genericTraitsSchema,
    cost: genericStringValueSchema,
    requirements: { type: "string", nullable: true, default: null },
    counteraction: { type: "boolean", default: false },
  },
} as const;

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
    "source",
    "publication"
  ],
  properties: {
    ...baseMeta,
    type: { type: "string", enum: ["actor"] as const },
    actorType: { type: "string", enum: ACTOR_CATEGORIES },
    rarity: { type: "string", enum: RARITIES },
    level: { type: "integer", minimum: -1 },
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
                tradition: { type: "string", nullable: true, default: null },
                system: {
                  ...actorSpellSystemSchema,
                  nullable: true,
                  default: null,
                },
              }
            }
          }
        }
      }
    },
    inventory: {
      type: "array",
      nullable: true,
      default: [] as const,
      items: {
        anyOf: actorInventoryEntryVariantSchemas,
      },
    },
    loot: {
      type: "object",
      nullable: true,
      default: null,
      additionalProperties: false,
      required: [],
      properties: {
        lootSheetType: { type: "string", enum: ["Loot", "Merchant"] as const, nullable: true, default: "Loot" },
        hiddenWhenEmpty: { type: "boolean", nullable: true, default: false },
      },
    },
    hazard: {
      type: "object",
      nullable: true,
      default: null,
      additionalProperties: false,
      required: [],
      properties: {
        isComplex: { type: "boolean", nullable: true, default: false },
        disable: { type: "string", nullable: true, default: null },
        routine: { type: "string", nullable: true, default: null },
        reset: { type: "string", nullable: true, default: null },
        emitsSound: {
          anyOf: [
            { type: "boolean" },
            { type: "string", enum: ["encounter"] as const },
            { type: "null" },
          ],
          default: "encounter",
        },
        hardness: { type: "integer", minimum: 0, nullable: true, default: 0 },
        stealthBonus: { type: "integer", nullable: true, default: null },
        stealthDetails: { type: "string", nullable: true, default: null },
      },
    },
    description: { type: "string", nullable: true, default: null },
    recallKnowledge: { type: "string", nullable: true, default: null },
    img: {
      type: "string",
      nullable: true,
      default: "systems/pf2e/icons/default-icons/npc.svg" as const,
    },
    source: { type: "string", default: "" },
    publication: publicationSchema
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

export type GeneratedEntityMap = {
  action: ActionSchemaData;
  item: ItemSchemaData;
  actor: ActorGenerationResult;
};

export type SchemaDataFor<K extends ValidatorKey> = K extends "action"
  ? ActionSchemaData
  : K extends "item"
    ? ItemSchemaData
    : K extends "actor"
      ? ActorSchemaData
      : PackEntrySchemaData;

export { ajv as ajvInstance };

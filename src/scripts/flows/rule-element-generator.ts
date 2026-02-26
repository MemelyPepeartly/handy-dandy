import type { JsonSchemaDefinition, OpenRouterClient } from "../openrouter/client";

export const PF2E_RULE_ELEMENT_KEYS = [
  "ActiveEffectLike",
  "ActorTraits",
  "AdjustDegreeOfSuccess",
  "AdjustModifier",
  "AdjustStrike",
  "Aura",
  "BaseSpeed",
  "BattleForm",
  "ChoiceSet",
  "CraftingAbility",
  "CreatureSize",
  "CriticalSpecialization",
  "DamageAlteration",
  "DamageDice",
  "DexterityModifierCap",
  "EphemeralEffect",
  "FastHealing",
  "FlatModifier",
  "GrantItem",
  "Immunity",
  "ItemAlteration",
  "LoseHitPoints",
  "MartialProficiency",
  "MultipleAttackPenalty",
  "Note",
  "Resistance",
  "RollOption",
  "RollTwice",
  "Sense",
  "SpecialResource",
  "SpecialStatistic",
  "Strike",
  "SubstituteRoll",
  "TempHP",
  "TokenEffectIcon",
  "TokenImage",
  "TokenLight",
  "TokenMark",
  "TokenName",
  "Weakness",
] as const;

export type PF2ERuleElementKey = (typeof PF2E_RULE_ELEMENT_KEYS)[number];

export interface RuleElementGenerationRequest {
  objective: string;
  targetItemType?: string;
  preferredRuleKeys?: string[];
  desiredRuleCount?: number;
  contextJson?: string;
  constraints?: string;
  seed?: number;
}

type RuleElementRecord = {
  key: string;
  [key: string]: unknown;
};

export interface RuleElementGenerationResult {
  systemId: "pf2e";
  summary: string;
  assumptions: string[];
  validationChecks: string[];
  rules: RuleElementRecord[];
}

const RULE_ELEMENT_GENERATION_SCHEMA: JsonSchemaDefinition = {
  name: "pf2e-rule-element-generation",
  description: "Generate PF2E Foundry rule elements.",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["systemId", "summary", "assumptions", "validationChecks", "rules"],
    properties: {
      systemId: { type: "string", enum: ["pf2e"] },
      summary: { type: "string" },
      assumptions: {
        type: "array",
        items: { type: "string" },
      },
      validationChecks: {
        type: "array",
        items: { type: "string" },
      },
      rules: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          required: ["key"],
          additionalProperties: true,
          properties: {
            key: { type: "string", minLength: 1 },
          },
        },
      },
    },
  },
};

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function normalizeRuleElements(value: unknown): RuleElementRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const entries: RuleElementRecord[] = [];
  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      continue;
    }

    const key = (candidate as { key?: unknown }).key;
    if (typeof key !== "string" || key.trim().length === 0) {
      continue;
    }

    entries.push({
      ...(candidate as Record<string, unknown>),
      key: key.trim(),
    });
  }

  return entries;
}

function normalizeRequestedCount(value: number | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  const integer = Math.trunc(value);
  if (integer < 1) {
    return undefined;
  }

  return Math.min(integer, 20);
}

function formatOptionalSection(label: string, value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    return `${label}: (none provided)`;
  }

  return `${label}:\n${trimmed}`;
}

export function buildRuleElementGenerationPrompt(request: RuleElementGenerationRequest): string {
  const desiredCount = normalizeRequestedCount(request.desiredRuleCount);
  const preferredRuleKeys = normalizeStringArray(request.preferredRuleKeys);
  const supportedKeys = PF2E_RULE_ELEMENT_KEYS.join(", ");

  const sections = [
    "You generate Pathfinder 2e Foundry VTT rule elements for the PF2E system.",
    "Return JSON only, matching the provided schema.",
    "The 'rules' array must be ready to paste into an item's system.rules field.",
    "Use only official PF2E rule-element keys and field names.",
    "Do not invent non-existent keys, selectors, or field structures.",
    "For typed bonuses/penalties (status/circumstance/item), prefer FlatModifier and AdjustModifier over ActiveEffectLike.",
    `Official PF2E rule-element keys: ${supportedKeys}`,
    "",
    formatOptionalSection("Requested behavior", request.objective),
    formatOptionalSection("Target item/effect type", request.targetItemType),
    formatOptionalSection(
      "Preferred rule-element keys",
      preferredRuleKeys.length > 0 ? preferredRuleKeys.join(", ") : undefined,
    ),
    formatOptionalSection(
      "Desired rule count",
      typeof desiredCount === "number" ? String(desiredCount) : undefined,
    ),
    formatOptionalSection("Existing JSON/context", request.contextJson),
    formatOptionalSection("Extra constraints", request.constraints),
    "",
    "Validation expectations:",
    "1. Keep JSON shape aligned with PF2E RE conventions.",
    "2. Include selectors, predicates, and slugs only when needed.",
    "3. Keep output concise and implementation-ready.",
  ];

  return sections.join("\n");
}

export function normalizeRuleElementGenerationResult(raw: unknown): RuleElementGenerationResult {
  const record = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};

  const systemId = record.systemId === "pf2e" ? "pf2e" : "pf2e";
  const summary = typeof record.summary === "string" ? record.summary.trim() : "";
  const assumptions = normalizeStringArray(record.assumptions);
  const validationChecks = normalizeStringArray(record.validationChecks);
  const rules = normalizeRuleElements(record.rules);

  if (rules.length === 0) {
    throw new Error("Generated response did not include any valid PF2E rule elements.");
  }

  return {
    systemId,
    summary,
    assumptions,
    validationChecks,
    rules,
  };
}

export async function generateRuleElements(
  openRouterClient: Pick<OpenRouterClient, "generateWithSchema">,
  request: RuleElementGenerationRequest,
): Promise<RuleElementGenerationResult> {
  const prompt = buildRuleElementGenerationPrompt(request);
  const raw = await openRouterClient.generateWithSchema<unknown>(
    prompt,
    RULE_ELEMENT_GENERATION_SCHEMA,
    { seed: request.seed },
  );

  return normalizeRuleElementGenerationResult(raw);
}

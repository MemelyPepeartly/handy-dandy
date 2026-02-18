const GLYPH_MAP: Record<string, string> = {
  "one-action": "1",
  "two-actions": "2",
  "three-actions": "3",
  reaction: "r",
  "free-action": "f",
  free: "f",
};

const CHECK_STAT_MAP: Record<string, string> = {
  fortitude: "fortitude",
  reflex: "reflex",
  will: "will",
  perception: "perception",
};

const DAMAGE_TYPES = [
  "acid",
  "bludgeoning",
  "bleed",
  "cold",
  "electricity",
  "fire",
  "force",
  "mental",
  "piercing",
  "poison",
  "slashing",
  "sonic",
  "spirit",
  "vitality",
  "void",
];

const OUTCOME_HEADERS = [
  "Critical Success",
  "Success",
  "Failure",
  "Critical Failure",
] as const;

const CONDITION_DEFINITIONS = {
  blinded: { label: "Blinded", id: "XgEqL1kFApUbl5Z2" },
  clumsy: { label: "Clumsy", id: "i3OJZU2nk64Df3xm" },
  concealed: { label: "Concealed", id: "DmAIPqOBomZ7H95W" },
  confused: { label: "Confused", id: "yblD8fOR1J8rDwEQ" },
  controlled: { label: "Controlled", id: "9qGBRpbX9NEwtAAr" },
  dazzled: { label: "Dazzled", id: "TkIyaNPgTZFBCCuh" },
  deafened: { label: "Deafened", id: "9PR9y0bi4JPKnHPR" },
  doomed: { label: "Doomed", id: "3uh1r86TzbQvosxv" },
  drained: { label: "Drained", id: "4D2KBtexWXa6oUMR" },
  enfeebled: { label: "Enfeebled", id: "MIRkyAjyBeXivMa7" },
  fascinated: { label: "Fascinated", id: "AdPVz7rbaVSRxHFg" },
  fatigued: { label: "Fatigued", id: "HL2l2VRSaQHu9lUw" },
  fleeing: { label: "Fleeing", id: "sDPxOjQ9kx2RZE8D" },
  frightened: { label: "Frightened", id: "TBSHQspnbcqxsmjL" },
  grabbed: { label: "Grabbed", id: "kWc1fhmv9LBiTuei" },
  hidden: { label: "Hidden", id: "iU0fEDdBp3rXpTMC" },
  immobilized: { label: "Immobilized", id: "eIcWbB5o3pP6OIMe" },
  invisible: { label: "Invisible", id: "zJxUflt9np0q4yML" },
  "off-guard": { label: "Off-Guard", id: "AJh5ex99aV6VTggg" },
  paralyzed: { label: "Paralyzed", id: "6uEgoh53GbXuHpTF" },
  petrified: { label: "Petrified", id: "dTwPJuKgBQCMxixg" },
  prone: { label: "Prone", id: "j91X7x0XSomq8d60" },
  quickened: { label: "Quickened", id: "nlCjDvLMf2EkV2dl" },
  restrained: { label: "Restrained", id: "VcDeM8A5oI6VqhbM" },
  sickened: { label: "Sickened", id: "fesd1n5eVhpCSS18" },
  slowed: { label: "Slowed", id: "xYTAsEpcJE1Ccni3" },
  stunned: { label: "Stunned", id: "dfCMdR4wnpbYNTix" },
  stupefied: { label: "Stupefied", id: "e1XGnhKNSQIm5IXg" },
  unconscious: { label: "Unconscious", id: "fBnFDH2MTzgFijKf" },
  wounded: { label: "Wounded", id: "Yl48xTdMh3aeQYL2" },
} as const;

type ConditionSlug = keyof typeof CONDITION_DEFINITIONS;

const CONDITION_ALIASES: Record<string, ConditionSlug> = {
  "flat-footed": "off-guard",
};

const CONDITION_LINK_KEYS: string[] = [
  ...Object.keys(CONDITION_DEFINITIONS),
  ...Object.keys(CONDITION_ALIASES),
];

const CONDITION_UUID_PATTERN =
  /@UUID\[Compendium\.pf2e\.(?:conditionitems|conditions)(?:\.Item)?\.([^\]\}]+)\](?:\{([^}]*)\})?/gi;
const CONDITION_COMPENDIUM_PATTERN =
  /@Compendium\[pf2e\.(?:conditionitems|conditions)\.([^\]\}]+)\](?:\{([^}]*)\})?/gi;
const CONDITION_ID_PATTERN = /^[A-Za-z0-9]{16}$/;

const DETAIL_HEADERS = [
  "Activate",
  "Trigger",
  "Requirements",
  "Requirement",
  "Effect",
  "Frequency",
  "Cost",
  "Saving Throw",
  "Maximum Duration",
  "Onset",
  "Stage",
] as const;

const HTML_TAG_PATTERN =
  /<\/?(?:p|ul|ol|li|hr|strong|em|span|br|code|blockquote|h[1-6]|table|thead|tbody|tr|td|th)\b/i;
const INLINE_MACRO_PATTERN = /@(?:UUID|Compendium|Check|Damage|Template)\[[^\]]+\](?:\{[^}]*\})?/gi;

function escapeHtml(value: string): string {
  const utils = (globalThis as { foundry?: { utils?: { escapeHTML?: (input: string) => string } } }).foundry?.utils;
  if (typeof utils?.escapeHTML === "function") {
    return utils.escapeHTML(value);
  }

  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeText(value: string): string {
  return value
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u00A0/g, " ");
}

function isLikelyHtml(value: string): boolean {
  return HTML_TAG_PATTERN.test(value);
}

function normalizeInlineMacroCasing(value: string): string {
  return value
    .replace(/@uuid\[/gi, "@UUID[")
    .replace(/@compendium\[/gi, "@Compendium[")
    .replace(/@check\[/gi, "@Check[")
    .replace(/@damage\[/gi, "@Damage[")
    .replace(/@template\[/gi, "@Template[");
}

function applyActionGlyphs(value: string): string {
  return value.replace(/\[(one-action|two-actions|three-actions|reaction|free-action|free)\]/gi, (match, token) => {
    const glyph = GLYPH_MAP[String(token).toLowerCase()];
    return glyph ? `<span class="pf2-icon">${glyph}</span>` : match;
  });
}

function applyInlineMarkdown(value: string): string {
  const bold = value.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  const italic = bold.replace(/(^|[^*])\*(?!\s)([^*]+?)\*/g, (_match, prefix: string, content: string) => {
    return `${prefix}<em>${content}</em>`;
  });
  return italic.replace(/`([^`]+?)`/g, "<code>$1</code>");
}

function applyInlineChecks(value: string): string {
  let next = value;

  next = next.replace(
    /\bDC\s*(\d+)\s*(Fortitude|Reflex|Will|Perception)\b/gi,
    (_match, dc: string, stat: string) => `@Check[${CHECK_STAT_MAP[stat.toLowerCase()] ?? stat.toLowerCase()}|dc:${dc}]`,
  );

  next = next.replace(
    /\b(Fortitude|Reflex|Will|Perception)\s*DC\s*(\d+)\b/gi,
    (_match, stat: string, dc: string) => `@Check[${CHECK_STAT_MAP[stat.toLowerCase()] ?? stat.toLowerCase()}|dc:${dc}]`,
  );

  return next;
}

function applyInlineDamage(value: string): string {
  const damageTypeGroup = DAMAGE_TYPES.join("|");
  let next = value;

  next = next.replace(
    new RegExp(`\\b(\\d+)d(\\d+)\\s+persistent\\s+(${damageTypeGroup})\\s+damage\\b`, "gi"),
    (_match, count: string, faces: string, damageType: string) => {
      return `@Damage[${count}d${faces}[persistent,${damageType.toLowerCase()}]] damage`;
    },
  );

  next = next.replace(
    new RegExp(`\\b((?:\\d+d\\d+(?:\\s*[+-]\\s*\\d+)?))\\s+(${damageTypeGroup})\\s+damage\\b`, "gi"),
    (_match, formula: string, damageType: string) => {
      const compact = formula.replace(/\s+/g, "");
      const wrapped = /[+-]/.test(compact) ? `(${compact})` : compact;
      return `@Damage[${wrapped}[${damageType.toLowerCase()}]] damage`;
    },
  );

  next = next.replace(
    new RegExp(`\\b(\\d+)\\s+(${damageTypeGroup})\\s+damage\\b`, "gi"),
    (_match, valueText: string, damageType: string) => {
      return `@Damage[${valueText}[${damageType.toLowerCase()}]] damage`;
    },
  );

  return next;
}

function applyInlineTemplates(value: string): string {
  return value.replace(
    /\b(\d+)\s*(?:-|\s)?\s*foot\s+(emanation|burst|cone|line)\b/gi,
    (_match, distance: string, shape: string) => {
      return `@Template[type:${shape.toLowerCase()}|distance:${distance}]`;
    },
  );
}

function normalizeLookupKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/['"`\u2019]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function resolveConditionSlug(value: string | null | undefined): ConditionSlug | null {
  if (!value) {
    return null;
  }

  const normalized = normalizeLookupKey(value);
  if (!normalized) {
    return null;
  }

  const withoutStage = normalized.replace(/-\d+$/, "");
  if (Object.hasOwn(CONDITION_DEFINITIONS, withoutStage)) {
    return withoutStage as ConditionSlug;
  }

  const alias = CONDITION_ALIASES[withoutStage];
  return alias ?? null;
}

function resolveConditionSlugFromId(id: string): ConditionSlug | null {
  for (const [slug, definition] of Object.entries(CONDITION_DEFINITIONS) as Array<[ConditionSlug, { id: string }]>) {
    if (definition.id === id) {
      return slug;
    }
  }
  return null;
}

function resolveConditionLabel(slug: ConditionSlug, fallbackLabel: string | null, sourceText?: string): string {
  const trimmedFallback = fallbackLabel?.trim();
  if (trimmedFallback) {
    return trimmedFallback;
  }

  const baseLabel = CONDITION_DEFINITIONS[slug].label;
  const stage = sourceText?.trim().match(/(?:^|\s)(\d+)(?:$|\s)/)?.[1];
  return stage ? `${baseLabel} ${stage}` : baseLabel;
}

function buildConditionUuidMacro(slug: ConditionSlug, label: string): string {
  const conditionId = CONDITION_DEFINITIONS[slug].id;
  return `@UUID[Compendium.pf2e.conditionitems.Item.${conditionId}]{${label}}`;
}

function normalizeConditionMacros(value: string): string {
  let next = value.replace(CONDITION_UUID_PATTERN, (macro, rawTarget: string, rawLabel: string | undefined) => {
    const target = rawTarget.trim();
    const label = rawLabel?.trim() || null;

    if (CONDITION_ID_PATTERN.test(target)) {
      const slug = resolveConditionSlugFromId(target);
      if (!slug) {
        return macro;
      }
      return buildConditionUuidMacro(slug, resolveConditionLabel(slug, label, label ?? undefined));
    }

    const slug = resolveConditionSlug(target) ?? resolveConditionSlug(label);
    if (!slug) {
      return macro;
    }

    return buildConditionUuidMacro(slug, resolveConditionLabel(slug, label, `${target} ${label ?? ""}`));
  });

  next = next.replace(CONDITION_COMPENDIUM_PATTERN, (macro, rawTarget: string, rawLabel: string | undefined) => {
    const target = rawTarget.trim();
    const label = rawLabel?.trim() || null;
    const slug = resolveConditionSlug(target) ?? resolveConditionSlug(label);
    if (!slug) {
      return macro;
    }

    return buildConditionUuidMacro(slug, resolveConditionLabel(slug, label, `${target} ${label ?? ""}`));
  });

  return next;
}

function applyConditionLinks(value: string): string {
  const canonicalMacros = normalizeConditionMacros(value);
  const macros: string[] = [];
  const masked = canonicalMacros.replace(INLINE_MACRO_PATTERN, (macro) => {
    const id = macros.push(macro) - 1;
    return `@@HD_MACRO_${id}@@`;
  });

  let next = masked;
  const keys = CONDITION_LINK_KEYS.sort((a, b) => b.length - a.length);
  for (const key of keys) {
    const slug = resolveConditionSlug(key);
    if (!slug) {
      continue;
    }
    const pattern = new RegExp(`\\b${escapeRegExp(key).replace(/-/g, "[-\\s]")}\\b(?:\\s+(\\d+))?`, "gi");
    next = next.replace(pattern, (_match, stage: string | undefined) => {
      const label = resolveConditionLabel(slug, null, stage);
      return buildConditionUuidMacro(slug, label);
    });
  }

  return next.replace(/@@HD_MACRO_(\d+)@@/g, (_placeholder, index: string) => {
    const macro = macros[Number(index)];
    return typeof macro === "string" ? macro : "";
  });
}

function formatDetailHeaderLine(value: string): string {
  let line = value;

  line = line.replace(/^Stage\s+(\d+)\b/i, "<strong>Stage $1</strong>");

  for (const header of DETAIL_HEADERS) {
    const pattern = new RegExp(`^${header}\\b:?\\s*`, "i");
    if (!pattern.test(line)) {
      continue;
    }

    line = line.replace(pattern, (match: string) => {
      const clean = match.replace(/:\s*$/, "").trim();
      return `<strong>${clean}</strong> `;
    });
    break;
  }

  for (const header of OUTCOME_HEADERS) {
    const pattern = new RegExp(`^${header}\\b:?\\s*`, "i");
    if (!pattern.test(line)) {
      continue;
    }

    line = line.replace(pattern, (match: string) => {
      const clean = match.replace(/:\s*$/, "").trim();
      return `<strong>${clean}</strong> `;
    });
    break;
  }

  return line.trim();
}

function formatInline(value: string): string {
  const macroNormalized = normalizeInlineMacroCasing(value);
  const escaped = escapeHtml(macroNormalized);
  const withGlyphs = applyActionGlyphs(escaped);
  const withMarkdown = applyInlineMarkdown(withGlyphs);
  const withChecks = applyInlineChecks(withMarkdown);
  const withDamage = applyInlineDamage(withChecks);
  const withTemplates = applyInlineTemplates(withDamage);
  const withConditions = applyConditionLinks(withTemplates);
  return formatDetailHeaderLine(withConditions);
}

function normalizeExistingHtmlRichText(value: string): string {
  const withMacros = normalizeInlineMacroCasing(value);
  const withMarkdown = applyInlineMarkdown(withMacros);
  return applyConditionLinks(withMarkdown);
}

function buildParagraph(lines: string[]): string {
  return `<p>${lines.join("<br />")}</p>`;
}

function buildList(items: string[]): string {
  return `<ul>${items.map((item) => `<li>${item}</li>`).join("")}</ul>`;
}

function startsWithOutcome(line: string): boolean {
  const plain = line.replace(/<[^>]+>/g, "").trim();
  return OUTCOME_HEADERS.some((header) => plain.toLowerCase().startsWith(header.toLowerCase()));
}

export function toPf2eRichText(value: string | null | undefined): string {
  const raw = value?.trim();
  if (!raw) {
    return "";
  }

  const normalized = normalizeText(raw);
  if (isLikelyHtml(normalized)) {
    return normalizeExistingHtmlRichText(normalized);
  }

  const lines = normalized.split(/\r?\n/);

  const blocks: string[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  let outcomesStarted = false;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push(buildParagraph(paragraph));
    paragraph = [];
  };

  const flushList = () => {
    if (!list.length) return;
    blocks.push(buildList(list));
    list = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      outcomesStarted = false;
      continue;
    }

    const bullet = line.match(/^(?:[-*\u2022]\s+)(.+)$/);
    if (bullet) {
      flushParagraph();
      list.push(formatInline(bullet[1].trim()));
      continue;
    }

    const formatted = formatInline(line);
    if (startsWithOutcome(formatted) && !outcomesStarted) {
      flushParagraph();
      flushList();
      blocks.push("<hr />");
      outcomesStarted = true;
    }

    flushList();
    paragraph.push(formatted);
  }

  flushParagraph();
  flushList();

  return blocks.join("");
}


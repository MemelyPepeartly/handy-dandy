export interface TraitDisplayEntry {
  slug: string;
  label: string;
  description?: string;
}

export interface TraitCategory {
  key: string;
  label: string;
  count: number;
  traits: TraitDisplayEntry[];
}

type Pf2eTraitDictionary = Record<string, string>;

let cachedTraitSlugSet: Set<string> | null | undefined;

export function collectTraitCategories(): TraitCategory[] {
  const pf2eConfig = getPf2eConfig();
  if (!pf2eConfig) return [];

  const traitDescriptions = extractTraitDescriptions(pf2eConfig);

  return getTraitDictionaries(pf2eConfig)
    .map(([key, traits]) => buildTraitCategory(key, traits, traitDescriptions))
    .filter((category): category is TraitCategory => category.traits.length > 0)
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function getTraitSlugSet(): Set<string> | null {
  if (cachedTraitSlugSet !== undefined) {
    return cachedTraitSlugSet;
  }

  const pf2eConfig = getPf2eConfig();
  if (!pf2eConfig) {
    cachedTraitSlugSet = null;
    return cachedTraitSlugSet;
  }

  const slugs = new Set<string>();
  for (const [, dictionary] of getTraitDictionaries(pf2eConfig)) {
    for (const slug of Object.keys(dictionary)) {
      const normalized = normalizeTraitSlug(slug);
      if (normalized) {
        slugs.add(normalized);
      }
    }
  }

  cachedTraitSlugSet = slugs;
  return cachedTraitSlugSet;
}

export function resetTraitSlugCache(): void {
  cachedTraitSlugSet = undefined;
}

function getPf2eConfig(): Record<string, unknown> | null {
  const pf2eConfig = (CONFIG as { PF2E?: Record<string, unknown> } | undefined)?.PF2E;
  if (!pf2eConfig || typeof pf2eConfig !== "object") {
    return null;
  }
  return pf2eConfig;
}

function getTraitDictionaries(config: Record<string, unknown>): Array<[string, Pf2eTraitDictionary]> {
  return Object.entries(config)
    .filter((entry): entry is [string, Pf2eTraitDictionary] => {
      const [key, value] = entry;
      return isTraitDictionaryKey(key) && isTraitDictionary(value);
    });
}

function buildTraitCategory(
  key: string,
  traits: Pf2eTraitDictionary,
  descriptions: Pf2eTraitDictionary,
): TraitCategory {
  const entries: TraitDisplayEntry[] = Object.entries(traits)
    .map(([slug, labelKey]) => ({
      slug,
      label: localizeLabel(labelKey, slug),
      description: localizeDescription(descriptions[slug]),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return {
    key,
    label: formatCategoryLabel(key),
    count: entries.length,
    traits: entries,
  } satisfies TraitCategory;
}

function extractTraitDescriptions(config: Record<string, unknown>): Pf2eTraitDictionary {
  const rawDescriptions = config["traitDescriptions"];
  if (!rawDescriptions || typeof rawDescriptions !== "object") return {};

  return Object.fromEntries(
    Object.entries(rawDescriptions as Record<string, unknown>)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

function isTraitDictionaryKey(key: string): boolean {
  return /(Traits|Tags)$/i.test(key) && key !== "traitDescriptions";
}

function isTraitDictionary(value: unknown): value is Pf2eTraitDictionary {
  if (!value || typeof value !== "object") return false;
  return Object.values(value as Record<string, unknown>).every((entry) => typeof entry === "string");
}

function localizeLabel(labelKey: string, fallbackSlug: string): string {
  if (typeof labelKey === "string" && game.i18n) {
    const localized = game.i18n.localize(labelKey);
    if (localized && localized !== labelKey) {
      return localized;
    }
  }

  return formatSlug(fallbackSlug);
}

function localizeDescription(descriptionKey: string | undefined): string | undefined {
  if (!descriptionKey) return undefined;
  if (!game.i18n) return descriptionKey;

  const localized = game.i18n.localize(descriptionKey);
  return localized && localized !== descriptionKey ? localized : descriptionKey;
}

function formatCategoryLabel(key: string): string {
  const suffix = key.endsWith("Tags") ? " Tags" : " Traits";
  const withoutSuffix = key.replace(/(Traits|Tags)$/i, "");
  const spaced = withoutSuffix
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[\-_]/g, " ")
    .trim();

  if (!spaced) {
    return suffix.trim();
  }

  return `${toTitleCase(spaced)}${suffix}`;
}

function formatSlug(slug: string): string {
  const spaced = slug.replace(/[-_]/g, " ");
  return toTitleCase(spaced);
}

function toTitleCase(value: string): string {
  const acronyms = new Set(["pf2e", "npc", "pc", "gm", "dc"]);
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((segment) => {
      const lower = segment.toLowerCase();
      if (acronyms.has(lower)) {
        return lower.toUpperCase();
      }
      if (segment.length <= 3 && segment === segment.toUpperCase()) {
        return segment.toUpperCase();
      }
      return `${segment[0]?.toUpperCase() ?? ""}${segment.slice(1).toLowerCase()}`;
    })
    .join(" ");
}

function normalizeTraitSlug(slug: string): string {
  return slug.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

const hot = (import.meta as ImportMeta & {
  hot?: { accept: (callback: () => void) => void };
}).hot;

if (hot) {
  hot.accept(() => {
    resetTraitSlugCache();
  });
}

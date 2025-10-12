import { CONSTANTS } from "../constants";

interface TraitCategoryOption {
  key: string;
  label: string;
  count: number;
}

interface TraitDisplayEntry {
  slug: string;
  label: string;
  description?: string;
}

interface TraitBrowserData {
  categories: TraitCategoryOption[];
  selectedKey: string | null;
  traits: TraitDisplayEntry[];
  error?: string;
}

type Pf2eTraitDictionary = Record<string, string>;

type TraitCategory = TraitCategoryOption & {
  traits: TraitDisplayEntry[];
};

export class TraitBrowserTool extends Application {
  #selectedKey: string | null = null;

  static override get defaultOptions(): ApplicationOptions {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "handy-dandy-trait-browser",
      title: "PF2e Trait Browser",
      template: `${CONSTANTS.TEMPLATE_PATH}/trait-browser-tool.hbs`,
      width: 500,
      height: 600,
      resizable: true,
      classes: ["handy-dandy", "trait-browser-tool"],
    });
  }

  override getData(): TraitBrowserData {
    const categories = collectTraitCategories();
    if (categories.length === 0) {
      return {
        categories: [],
        selectedKey: null,
        traits: [],
        error: "PF2e trait data is unavailable. Ensure the Pathfinder 2e system is active.",
      } satisfies TraitBrowserData;
    }

    const selectedKey = this.#ensureSelectedKey(categories);
    const selectedCategory = categories.find(category => category.key === selectedKey);

    return {
      categories: categories.map(({ key, label, count }) => ({ key, label, count })),
      selectedKey,
      traits: selectedCategory?.traits ?? [],
    } satisfies TraitBrowserData;
  }

  override activateListeners(html: JQuery): void {
    super.activateListeners(html);

    html.find<HTMLSelectElement>("select[name='trait-category']").on("change", event => {
      this.#selectedKey = (event.currentTarget as HTMLSelectElement).value;
      this.render(false);
    });

    html.find<HTMLElement>("[data-action='copy-trait']").on("click", async event => {
      const element = event.currentTarget as HTMLElement;
      const slug = element.dataset["slug"];
      if (!slug) return;

      try {
        await navigator.clipboard.writeText(slug);
        ui.notifications?.info(`Copied trait slug ${slug}`);
      } catch (error) {
        console.warn(`${CONSTANTS.MODULE_NAME} | Failed to copy trait slug`, error);
        ui.notifications?.warn("Unable to copy trait slug to the clipboard.");
      }
    });
  }

  #ensureSelectedKey(categories: TraitCategory[]): string {
    if (this.#selectedKey && categories.some(category => category.key === this.#selectedKey)) {
      return this.#selectedKey;
    }

    const [first] = categories;
    this.#selectedKey = first.key;
    return first.key;
  }
}

function collectTraitCategories(): TraitCategory[] {
  const pf2eConfig = (CONFIG as { PF2E?: Record<string, unknown> }).PF2E;
  if (!pf2eConfig) return [];

  const traitDescriptions = extractTraitDescriptions(pf2eConfig);

  return Object.entries(pf2eConfig)
    .filter(([key, value]) => isTraitDictionaryKey(key) && isTraitDictionary(value))
    .map(([key, value]) => buildTraitCategory(key, value as Pf2eTraitDictionary, traitDescriptions))
    .filter((category): category is TraitCategory => category.traits.length > 0)
    .sort((a, b) => a.label.localeCompare(b.label));
}

function isTraitDictionaryKey(key: string): boolean {
  return /(Traits|Tags)$/i.test(key) && key !== "traitDescriptions";
}

function isTraitDictionary(value: unknown): value is Pf2eTraitDictionary {
  if (!value || typeof value !== "object") return false;
  return Object.values(value as Record<string, unknown>).every(entry => typeof entry === "string");
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
    .map(segment => {
      const lower = segment.toLowerCase();
      if (acronyms.has(lower)) {
        return lower.toUpperCase();
      }
      if (segment.length <= 3 && segment === segment.toUpperCase()) {
        return segment;
      }
      return segment.charAt(0).toUpperCase() + segment.slice(1);
    })
    .join(" ");
}

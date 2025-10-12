import { CONSTANTS } from "../constants";
import {
  collectTraitCategories,
  type TraitCategory,
  type TraitDisplayEntry,
} from "../data/trait-dictionaries";

interface TraitCategoryOption {
  key: string;
  label: string;
  count: number;
}

interface TraitBrowserData {
  categories: TraitCategoryOption[];
  selectedKey: string | null;
  traits: TraitDisplayEntry[];
  error?: string;
}

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

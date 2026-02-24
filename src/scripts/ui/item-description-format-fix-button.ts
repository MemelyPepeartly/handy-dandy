import { CONSTANTS } from "../constants";
import { fromFoundryItem, type FoundryItem } from "../mappers/export";
import type { JsonSchemaDefinition } from "../openrouter/client";
import { repairPf2eInlineMacros, toPf2eRichText } from "../text/pf2e-rich-text";

const ACTION_ROW_CLASS = "handy-dandy-item-description-actions" as const;
const BUTTON_CLASS = "handy-dandy-item-description-format-fix" as const;
const BUTTON_ICON_FORMAT = "fas fa-wand-magic-sparkles" as const;
const BUTTON_TEXT_FORMAT = "Fix Format" as const;
const REMIX_BUTTON_CLASS = "handy-dandy-item-description-remix" as const;
const BUTTON_ICON_REMIX = "fas fa-feather-pointed" as const;
const BUTTON_TEXT_REMIX = "Remix Text" as const;

const DESCRIPTION_REWRITE_SCHEMA: JsonSchemaDefinition = {
  name: "item_description_remix",
  description: "Rewritten PF2E item description for Foundry rich text",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      description: {
        type: "string",
        description: "Rewritten item description in PF2E-friendly prose with optional inline macros.",
      },
    },
    required: ["description"],
  },
};

function setBusy(button: JQuery<HTMLElement>, busy: boolean, idleIcon: string): void {
  button.prop("disabled", busy);
  const icon = button.find("i");
  icon.attr("class", busy ? "fas fa-spinner fa-spin" : idleIcon);
}

function resolveItemDescriptionValue(item: Item): string | null {
  const candidate = (item as Item & { system?: { description?: { value?: unknown } } }).system?.description?.value;
  return typeof candidate === "string" ? candidate : null;
}

function stripHtml(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readStringValue(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (isRecord(value)) {
    return readStringValue(value.value);
  }

  return null;
}

function readNumberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (isRecord(value)) {
    return readNumberValue(value.value);
  }

  return null;
}

function readStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }

  if (typeof value === "string") {
    return value
      .split(/[,\n;]/)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }

  return [];
}

function extractActorContext(item: Item): string {
  const actor = item.actor;
  if (!(actor instanceof Actor)) {
    return "No parent actor context (this appears to be a standalone/world item).";
  }

  const actorSystem = (actor as Actor & { system?: Record<string, unknown> }).system ?? {};
  const details = isRecord(actorSystem.details) ? actorSystem.details : {};
  const traits = isRecord(actorSystem.traits) ? actorSystem.traits : {};

  const level = readNumberValue(details.level);
  const rarity = readStringValue(traits.rarity);
  const traitValue = readStringList(traits.value).slice(0, 8);
  const notesSource = readStringValue(details.publicNotes) ??
    readStringValue(details.privateNotes) ??
    readStringValue((isRecord(actorSystem.details) ? actorSystem.details.description : null));
  const notePreview = notesSource ? truncate(stripHtml(notesSource), 320) : "";

  const siblingItems = Array.from(actor.items.values())
    .filter((entry) => entry.id !== item.id)
    .slice(0, 20)
    .map((entry) => `${entry.name ?? "Unnamed"} (${entry.type ?? "item"})`);

  const summaryParts = [
    `Actor: ${actor.name} (${String(actor.type ?? "actor").toUpperCase()})`,
    typeof level === "number" ? `Level: ${Math.max(0, Math.trunc(level))}` : null,
    rarity ? `Rarity: ${rarity}` : null,
    traitValue.length ? `Traits: ${traitValue.join(", ")}` : null,
  ].filter((entry): entry is string => typeof entry === "string");

  const sections = [summaryParts.join(" | ")];
  if (notePreview) {
    sections.push(`Vibe excerpt:\n${notePreview}`);
  }
  if (siblingItems.length) {
    sections.push(`Sibling item names/types:\n${siblingItems.join(", ")}`);
  }

  return sections.join("\n\n");
}

function buildDescriptionRemixPrompt(item: Item, currentDescription: string, instructions: string): string {
  const canonical = fromFoundryItem(item.toObject() as unknown as FoundryItem);
  const currentPlainText = truncate(stripHtml(currentDescription), 4000);
  const actorContext = extractActorContext(item);
  const canonicalSnapshot = {
    name: canonical.name,
    slug: canonical.slug,
    itemType: canonical.itemType,
    level: canonical.level,
    rarity: canonical.rarity,
    traits: canonical.traits ?? [],
    source: canonical.source ?? null,
    publication: canonical.publication,
  };

  const sections = [
    "Rewrite this Pathfinder 2e item description for a Foundry VTT sheet.",
    "Keep the same mechanics and intent unless explicitly asked to change details.",
    "Current item snapshot (JSON):",
    JSON.stringify(canonicalSnapshot, null, 2),
    "Current description text:",
    currentPlainText,
    "Sheet-level context:",
    actorContext,
    "Output requirements:",
    "- Preserve mechanical meaning, numbers, and gameplay intent unless explicitly overridden.",
    "- Improve readability, structure, and PF2E-rich formatting.",
    "- Keep tone/theme aligned with actor and sibling content context.",
    "- Use PF2E inline macros where appropriate: @Check, @Damage, @Template, @UUID.",
    "- Return only the rewritten description body text (no explanations, no markdown fences).",
  ];

  const trimmedInstructions = instructions.trim();
  if (trimmedInstructions.length > 0) {
    sections.push(`Additional rewrite instructions:\n${trimmedInstructions}`);
  }

  return sections.join("\n\n");
}

async function promptDescriptionRemixInstructions(item: Item): Promise<string | null> {
  const actorName = item.actor?.name?.trim();
  const actorHint = actorName ? ` in the context of ${actorName}` : "";

  const content = `
    <form class="handy-dandy-item-description-remix-form" style="display:flex;flex-direction:column;gap:0.75rem;min-width:560px;">
      <p class="notes">Rewrite <strong>${item.name ?? "item"}</strong>${actorHint} while preserving existing mechanics.</p>
      <div class="form-group">
        <label for="handy-dandy-item-description-remix-instructions">Additional Direction (optional)</label>
        <textarea id="handy-dandy-item-description-remix-instructions" name="instructions" rows="6" placeholder="Example: keep all mechanics intact, tighten wording, and push an eerie alchemical tone."></textarea>
      </div>
    </form>
  `;

  const response = await new Promise<string | null>((resolve) => {
    let settled = false;
    const finish = (value: string | null): void => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };

    const dialog = new Dialog(
      {
        title: `${CONSTANTS.MODULE_NAME} | Remix Description`,
        content,
        buttons: {
          remix: {
            icon: '<i class="fas fa-feather-pointed"></i>',
            label: "Rewrite",
            callback: (html) => {
              const form = html[0]?.querySelector("form");
              if (!(form instanceof HTMLFormElement)) {
                finish("");
                return;
              }

              const formData = new FormData(form);
              finish(String(formData.get("instructions") ?? "").trim());
            },
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: "Cancel",
            callback: () => finish(null),
          },
        },
        default: "remix",
        close: () => finish(null),
      },
      { jQuery: true, width: 680 },
    );

    dialog.render(true);
  });

  return response;
}

function resolveDescriptionTab(html: JQuery<HTMLElement>): JQuery<HTMLElement> {
  const candidates = [
    '.tab[data-tab="description"]',
    '.sheet-content .tab[data-tab="description"]',
    'section[data-tab="description"]',
  ] as const;

  for (const selector of candidates) {
    const match = html.find(selector).first();
    if (match.length > 0) {
      return match;
    }
  }

  return $();
}

type ActionRowPlacement = "before" | "after" | "prepend";

interface ActionRowMountPoint {
  placement: ActionRowPlacement;
  target: JQuery<HTMLElement>;
}

function resolveActionRowMountPoint(html: JQuery<HTMLElement>): ActionRowMountPoint | null {
  const sidebarInventory = html.find(".sheet-content section.sidebar .inventory-details").first();
  if (sidebarInventory.length > 0) {
    const categoryInput = sidebarInventory
      .find('[name="system.category"], select[name="system.category"], [data-property="system.category"]')
      .first();
    if (categoryInput.length > 0) {
      const categoryGroup = categoryInput.closest(".form-group");
      if (categoryGroup.length > 0) {
        return {
          placement: "after",
          target: categoryGroup.first(),
        };
      }
    }

    return {
      placement: "prepend",
      target: sidebarInventory,
    };
  }

  const detailsTab = html.find('.tab[data-tab="details"]').first();
  if (detailsTab.length > 0) {
    const detailsDescriptionLink = detailsTab.find('[data-tab="description"]').first();
    if (detailsDescriptionLink.length > 0) {
      const navContainer = detailsDescriptionLink.closest("nav, .tabs, .sheet-tabs, .tab-navigation");
      if (navContainer.length > 0) {
        return {
          placement: "after",
          target: navContainer.first(),
        };
      }
    }

    const detailsDescriptionEditor = detailsTab
      .find('[data-edit="system.description.value"], [name="system.description.value"], .editor-container.main .editor')
      .first();
    if (detailsDescriptionEditor.length > 0) {
      const editorContainer = detailsDescriptionEditor.closest(".editor-container, .form-group");
      return {
        placement: "before",
        target: (editorContainer.length > 0 ? editorContainer : detailsDescriptionEditor).first(),
      };
    }

    return {
      placement: "prepend",
      target: detailsTab,
    };
  }

  const descriptionTab = resolveDescriptionTab(html);
  if (descriptionTab.length > 0) {
    const primaryDescriptionEditor = descriptionTab
      .find('[data-edit="system.description.value"], [name="system.description.value"], section.main.editor-container, .editor')
      .first();
    if (primaryDescriptionEditor.length > 0) {
      const editorContainer = primaryDescriptionEditor.closest(".editor-container, .form-group");
      return {
        placement: "before",
        target: (editorContainer.length > 0 ? editorContainer : primaryDescriptionEditor).first(),
      };
    }

    return {
      placement: "prepend",
      target: descriptionTab,
    };
  }

  const body = html.find(".sheet-body").first();
  if (body.length > 0) {
    return {
      placement: "prepend",
      target: body,
    };
  }

  return null;
}

export function registerItemDescriptionFormatFixButton(): void {
  Hooks.on("renderItemSheetPF2e", (app: ItemSheet, html: JQuery<HTMLElement>) => {
    const item = app.item ?? app.document;
    if (!(item instanceof Item)) return;

    const user = game.user;
    if (!user) return;
    if (!user.isGM && !item.isOwner) return;

    if (html.find(`.${ACTION_ROW_CLASS}`).length > 0) return;

    const formatButton = $(
      `<button type="button" class="${BUTTON_CLASS}">
        <i class="${BUTTON_ICON_FORMAT}"></i>
        <span>${BUTTON_TEXT_FORMAT}</span>
      </button>`,
    );

    const remixButton = $(
      `<button type="button" class="${REMIX_BUTTON_CLASS}">
        <i class="${BUTTON_ICON_REMIX}"></i>
        <span>${BUTTON_TEXT_REMIX}</span>
      </button>`,
    );

    formatButton.on("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      const currentDescription = resolveItemDescriptionValue(item);
      if (!currentDescription || !currentDescription.trim()) {
        ui.notifications?.warn(`${CONSTANTS.MODULE_NAME} | This item has no description text to reformat.`);
        return;
      }

      void (async () => {
        setBusy(formatButton, true, BUTTON_ICON_FORMAT);
        try {
          const repaired = repairPf2eInlineMacros(currentDescription);
          if (repaired === currentDescription) {
            ui.notifications?.info(`${CONSTANTS.MODULE_NAME} | No formatting fixes were detected.`);
            return;
          }

          const updateData: Record<string, unknown> = {
            "system.description.value": repaired,
          };
          await item.update(updateData);
          ui.notifications?.info(`${CONSTANTS.MODULE_NAME} | Updated description formatting for ${item.name}.`);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          ui.notifications?.error(`${CONSTANTS.MODULE_NAME} | Description format fix failed: ${message}`);
          console.error(`${CONSTANTS.MODULE_NAME} | Description format fix failed`, error);
        } finally {
          setBusy(formatButton, false, BUTTON_ICON_FORMAT);
        }
      })();
    });

    remixButton.on("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      const currentDescription = resolveItemDescriptionValue(item);
      if (!currentDescription || !currentDescription.trim()) {
        ui.notifications?.warn(`${CONSTANTS.MODULE_NAME} | This item has no description text to remix.`);
        return;
      }

      const openRouterClient = game.handyDandy?.openRouterClient;
      if (!openRouterClient || typeof openRouterClient.generateWithSchema !== "function") {
        ui.notifications?.error(`${CONSTANTS.MODULE_NAME} | OpenRouter text generation is unavailable.`);
        return;
      }

      void (async () => {
        const instructions = await promptDescriptionRemixInstructions(item);
        if (instructions === null) {
          return;
        }

        setBusy(remixButton, true, BUTTON_ICON_REMIX);
        try {
          const prompt = buildDescriptionRemixPrompt(item, currentDescription, instructions);
          const response = await openRouterClient.generateWithSchema<{ description: string }>(
            prompt,
            DESCRIPTION_REWRITE_SCHEMA,
          );

          const candidate = typeof response.description === "string"
            ? response.description.trim()
            : "";
          if (!candidate) {
            throw new Error("OpenRouter returned an empty description.");
          }

          const remixed = repairPf2eInlineMacros(toPf2eRichText(candidate));
          if (!remixed.trim()) {
            throw new Error("Generated description could not be normalized.");
          }

          if (remixed === currentDescription) {
            ui.notifications?.info(`${CONSTANTS.MODULE_NAME} | Description rewrite produced no visible changes.`);
            return;
          }

          const updateData: Record<string, unknown> = {
            "system.description.value": remixed,
          };
          await item.update(updateData);
          ui.notifications?.info(`${CONSTANTS.MODULE_NAME} | Remixed description for ${item.name}.`);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          ui.notifications?.error(`${CONSTANTS.MODULE_NAME} | Description remix failed: ${message}`);
          console.error(`${CONSTANTS.MODULE_NAME} | Description remix failed`, error);
        } finally {
          setBusy(remixButton, false, BUTTON_ICON_REMIX);
        }
      })();
    });

    const actionRow = $(`<div class="${ACTION_ROW_CLASS}"></div>`);
    actionRow.append(formatButton);
    actionRow.append(remixButton);

    const mountPoint = resolveActionRowMountPoint(html);
    if (!mountPoint) return;

    if (mountPoint.placement === "after") {
      mountPoint.target.after(actionRow);
      return;
    }

    if (mountPoint.placement === "before") {
      mountPoint.target.before(actionRow);
      return;
    }

    mountPoint.target.prepend(actionRow);
  });
}

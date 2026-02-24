import { CONSTANTS } from "../constants";
import { fromFoundryItem, type FoundryItem } from "../mappers/export";
import type { JsonSchemaDefinition } from "../openrouter/client";
import { repairPf2eInlineMacros, toPf2eRichText } from "../text/pf2e-rich-text";
import { runItemRemixWithRequest } from "../flows/item-remix";

const BUTTON_CLASS = "handy-dandy-item-remix-button" as const;
const BUTTON_ICON = "fas fa-random" as const;
const BUTTON_TEXT = "Remix" as const;
const BUTTON_TITLE = "Open Handy Dandy item remixer" as const;
const BUTTON_TEXT_FORMAT = "Repair Links" as const;
const BUTTON_TEXT_REMIX = "Run Remix" as const;

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
  const element = button[0];
  if (element instanceof HTMLButtonElement) {
    button.prop("disabled", busy);
  }
  button.toggleClass("disabled", busy);
  button.attr("aria-disabled", busy ? "true" : "false");
  const icon = button.find("i");
  icon.attr("class", busy ? "fas fa-spinner fa-spin" : idleIcon);
}

type PlannerAction = "repair-links" | "run-remix";
type DescriptionRemixMode = "preserve" | "retheme";

interface ItemRemixPlannerRequest {
  action: PlannerAction;
  remixDescription: boolean;
  remixMechanics: boolean;
  remixTraits: boolean;
  remixIdentity: boolean;
  remixEconomy: boolean;
  preserveIdentity: boolean;
  descriptionMode: DescriptionRemixMode;
  instructions: string;
  generateItemImage: boolean;
  itemImagePrompt?: string;
}

function escapeHtml(value: string): string {
  const utils = foundry.utils as { escapeHTML?: (input: string) => string };
  if (typeof utils.escapeHTML === "function") {
    return utils.escapeHTML(value);
  }

  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parsePlannerFormRequest(formData: FormData, action: PlannerAction): ItemRemixPlannerRequest {
  const itemImagePrompt = String(formData.get("itemImagePrompt") ?? "").trim();
  const descriptionMode = String(formData.get("descriptionMode") ?? "preserve");
  return {
    action,
    remixDescription: Boolean(formData.get("remixDescription")),
    remixMechanics: Boolean(formData.get("remixMechanics")),
    remixTraits: Boolean(formData.get("remixTraits")),
    remixIdentity: Boolean(formData.get("remixIdentity")),
    remixEconomy: Boolean(formData.get("remixEconomy")),
    preserveIdentity: Boolean(formData.get("preserveIdentity")),
    descriptionMode: descriptionMode === "retheme" ? "retheme" : "preserve",
    instructions: String(formData.get("instructions") ?? "").trim(),
    generateItemImage: Boolean(formData.get("generateItemImage")),
    itemImagePrompt: itemImagePrompt || undefined,
  };
}

function hasAnyRemixSections(request: ItemRemixPlannerRequest): boolean {
  return request.remixDescription ||
    request.remixMechanics ||
    request.remixTraits ||
    request.remixIdentity ||
    request.remixEconomy;
}

function buildScopedRemixInstructions(request: ItemRemixPlannerRequest): string {
  const selected: string[] = [];
  const locked: string[] = [];

  const register = (enabled: boolean, on: string, off: string): void => {
    if (enabled) {
      selected.push(on);
    } else {
      locked.push(off);
    }
  };

  register(request.remixDescription, "description text and formatting", "description text");
  register(request.remixMechanics, "mechanical rules fields (activation/effects/frequency/requirements)", "mechanical rules fields");
  register(request.remixTraits, "traits and rarity tags", "traits and rarity");
  register(request.remixIdentity, "identity fields (name/slug/level/itemType)", "identity fields");
  register(request.remixEconomy, "economy/value fields (price, quantity, usage context)", "economy/value fields");

  const parts: string[] = [
    `Remix only these item sections: ${selected.join(", ")}.`,
    locked.length > 0
      ? `Preserve these sections exactly unless technically required: ${locked.join(", ")}.`
      : "All major sections are in remix scope.",
    request.preserveIdentity
      ? "Preserve current item identity and role unless explicitly overridden by instructions."
      : "Identity changes are allowed if they improve coherence with requested goals.",
  ];

  if (request.remixDescription) {
    if (request.descriptionMode === "preserve") {
      parts.push("Keep the existing item vibe/context while improving clarity and PF2E formatting.");
    } else {
      parts.push("Retheme description tone/context while keeping PF2E-valid mechanical intent.");
    }
  }

  if (request.remixMechanics) {
    parts.push("Keep mechanics PF2E-valid and consistent with the item's intended role.");
  }

  if (request.remixTraits) {
    parts.push("Traits and rarity must use canonical PF2E-compatible tags.");
  }

  if (request.generateItemImage) {
    parts.push("Generate a transparent item icon suitable for Foundry item sheets.");
  }

  if (request.itemImagePrompt) {
    parts.push(`Item icon direction: ${request.itemImagePrompt}`);
  }

  if (request.instructions) {
    parts.push(request.instructions);
  }

  return parts.join("\n");
}

async function promptItemToolChoice(item: Item): Promise<ItemRemixPlannerRequest | null> {
  const content = `
    <div class="handy-dandy-item-tools-dialog">
      <form class="handy-dandy-item-remix-planner-form" style="display:flex;flex-direction:column;gap:0.75rem;min-width:700px;">
        <div style="padding:0.5rem 0.65rem;border:1px solid rgba(0,0,0,0.18);border-radius:8px;background:rgba(0,0,0,0.04);">
          <strong>Item Remix Planner</strong>
          <div class="notes">Current item: <strong>${escapeHtml(item.name ?? "Unnamed Item")}</strong></div>
          <div class="notes">Choose which item sections to remix, then run a scoped remix pass.</div>
        </div>
        <fieldset style="border:1px solid rgba(0,0,0,0.2);border-radius:6px;padding:0.5rem 0.65rem;">
          <legend style="padding:0 0.2rem;">Remix Scope</legend>
          <label style="display:block;"><input type="checkbox" name="remixDescription" checked /> Description text and formatting</label>
          <label style="display:block;"><input type="checkbox" name="remixMechanics" checked /> Mechanics (activation, requirements, effects, frequency)</label>
          <label style="display:block;"><input type="checkbox" name="remixTraits" checked /> Traits and rarity</label>
          <label style="display:block;"><input type="checkbox" name="remixIdentity" /> Identity (name, slug, level, item type)</label>
          <label style="display:block;"><input type="checkbox" name="remixEconomy" /> Economy/value fields (price and related details)</label>
        </fieldset>
        <fieldset style="border:1px solid rgba(0,0,0,0.2);border-radius:6px;padding:0.5rem 0.65rem;">
          <legend style="padding:0 0.2rem;">Description Rewrite Style</legend>
          <label style="display:block;"><input type="radio" name="descriptionMode" value="preserve" checked /> Polish existing text only: keep current theme/context, improve clarity and formatting</label>
          <label style="display:block;"><input type="radio" name="descriptionMode" value="retheme" /> Rewrite theme/tone: allow creative reframing, but keep mechanics PF2E-valid</label>
          <label style="display:block;margin-top:0.35rem;"><input type="checkbox" name="preserveIdentity" checked /> Keep item identity locked (name, slug, level, item type) unless I explicitly request changes</label>
        </fieldset>
        <fieldset style="border:1px solid rgba(0,0,0,0.2);border-radius:6px;padding:0.5rem 0.65rem;">
          <legend style="padding:0 0.2rem;">Optional Icon</legend>
          <label style="display:block;"><input type="checkbox" name="generateItemImage" /> Generate transparent item icon</label>
          <div class="form-group" style="margin-top:0.35rem;">
            <label for="handy-dandy-item-remix-image-prompt">Item image prompt override</label>
            <input id="handy-dandy-item-remix-image-prompt" type="text" name="itemImagePrompt" placeholder="Optional icon art direction" />
          </div>
        </fieldset>
        <div class="form-group">
          <label for="handy-dandy-item-remix-instructions">Additional Instructions</label>
          <textarea id="handy-dandy-item-remix-instructions" name="instructions" rows="6" placeholder="Specific directions for this remix pass."></textarea>
        </div>
      </form>
    </div>
  `;

  const response = await new Promise<ItemRemixPlannerRequest | null>((resolve) => {
    let settled = false;
    const finish = (value: ItemRemixPlannerRequest | null): void => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };

    const dialog = new Dialog(
      {
        title: `${CONSTANTS.MODULE_NAME} | Item Remixer`,
        content,
        buttons: {
          repair: {
            icon: '<i class="fas fa-wand-magic-sparkles"></i>',
            label: BUTTON_TEXT_FORMAT,
            callback: (html) => {
              const form = html[0]?.querySelector("form");
              if (!(form instanceof HTMLFormElement)) {
                finish(null);
                return;
              }
              const formData = new FormData(form);
              finish(parsePlannerFormRequest(formData, "repair-links"));
            },
          },
          remix: {
            icon: '<i class="fas fa-random"></i>',
            label: BUTTON_TEXT_REMIX,
            callback: (html) => {
              const form = html[0]?.querySelector("form");
              if (!(form instanceof HTMLFormElement)) {
                finish(null);
                return;
              }
              const formData = new FormData(form);
              finish(parsePlannerFormRequest(formData, "run-remix"));
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
      { jQuery: true, width: 820 },
    );

    dialog.render(true);
  });

  return response;
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

export function registerItemDescriptionFormatFixButton(): void {
  Hooks.on("renderItemSheetPF2e", (app: ItemSheet, html: JQuery<HTMLElement>) => {
    const item = app.item ?? app.document;
    if (!(item instanceof Item)) return;

    const user = game.user;
    if (!user) return;
    if (!user.isGM && !item.isOwner) return;

    const windowHeader = html.find(".window-header").first();
    if (windowHeader.length === 0) return;
    if (windowHeader.find(`.${BUTTON_CLASS}`).length > 0) return;

    const button = $(
      `<a class="${BUTTON_CLASS}" title="${BUTTON_TITLE}" role="button" aria-disabled="false">
        <i class="${BUTTON_ICON}"></i>
        <span>${BUTTON_TEXT}</span>
      </a>`,
    );

    button.on("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      void (async () => {
        const request = await promptItemToolChoice(item);
        if (!request) {
          return;
        }

        setBusy(button, true, BUTTON_ICON);
        try {
          if (request.action === "repair-links") {
            const currentDescription = resolveItemDescriptionValue(item);
            if (!currentDescription || !currentDescription.trim()) {
              ui.notifications?.warn(`${CONSTANTS.MODULE_NAME} | This item has no description text to reformat.`);
              return;
            }

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
            return;
          }

          if (!hasAnyRemixSections(request)) {
            ui.notifications?.warn(`${CONSTANTS.MODULE_NAME} | Select at least one item section to remix.`);
            return;
          }

          const descriptionOnly = request.remixDescription &&
            !request.remixMechanics &&
            !request.remixTraits &&
            !request.remixIdentity &&
            !request.remixEconomy &&
            !request.generateItemImage;

          if (!descriptionOnly) {
            const scopedInstructions = buildScopedRemixInstructions(request);
            await runItemRemixWithRequest(item, {
              instructions: scopedInstructions,
              generateItemImage: request.generateItemImage || undefined,
              itemImagePrompt: request.itemImagePrompt,
            });
            return;
          }

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

          const remixDirection = request.descriptionMode === "preserve"
            ? "Keep the same context/theme as the original item and improve quality/clarity."
            : "You may retheme context/tone, but mechanics must stay coherent and PF2E-valid.";
          const mergedInstructions = [remixDirection, request.instructions].filter((entry) => entry.trim().length > 0).join("\n");
          const prompt = buildDescriptionRemixPrompt(item, currentDescription, mergedInstructions);
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
          const prefix = request.action === "repair-links" ? "Description format fix failed" : "Description remix failed";
          ui.notifications?.error(`${CONSTANTS.MODULE_NAME} | ${prefix}: ${message}`);
          console.error(`${CONSTANTS.MODULE_NAME} | ${prefix}`, error);
        } finally {
          setBusy(button, false, BUTTON_ICON);
        }
      })();
    });

    const closeButton = windowHeader.find(".close").first();
    if (closeButton.length > 0) {
      closeButton.before(button);
    } else {
      windowHeader.append(button);
    }
  });
}

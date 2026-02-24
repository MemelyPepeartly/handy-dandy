import { CONSTANTS } from "../constants";
import { buildItemImagePrompt, generateItemImage } from "../generation/token-image";
import { promptImageGenerationRequest } from "./image-generation-dialog";

const BUTTON_CLASS = "handy-dandy-item-image-generate" as const;
const STACK_CLASS = "handy-dandy-item-image-stack" as const;
const BUTTON_ICON = "fas fa-palette" as const;
const BUTTON_TEXT = "Generate Image" as const;

function toSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
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

function setBusy(button: JQuery<HTMLElement>, busy: boolean): void {
  button.prop("disabled", busy);
  const icon = button.find("i");
  icon.attr("class", busy ? "fas fa-spinner fa-spin" : BUTTON_ICON);
}

function resolveItemDescription(item: Item): string | null {
  const candidate = (item as Item & { system?: { description?: { value?: unknown } } }).system?.description?.value;
  if (typeof candidate !== "string") {
    return null;
  }
  const text = stripHtml(candidate);
  return text.length > 0 ? text : null;
}

export function registerItemImageGenerateButton(): void {
  Hooks.on("renderItemSheetPF2e", (app: ItemSheet, html: JQuery<HTMLElement>) => {
    const item = app.item ?? app.document;
    if (!(item instanceof Item)) return;

    const user = game.user;
    if (!user) return;
    if (!user.isGM && !item.isOwner) return;

    const imageElement = html.find(".sheet-header img[data-edit=\"img\"]").first();
    if (imageElement.length === 0) return;

    let stack = imageElement.parent(`.${STACK_CLASS}`).first();
    if (stack.length === 0) {
      stack = $(`<div class="${STACK_CLASS}"></div>`);
      stack.css({
        display: "inline-flex",
        "flex-direction": "column",
        "align-items": "center",
        gap: "6px",
      });
      imageElement.before(stack);
      stack.append(imageElement);
    }

    if (stack.find(`.${BUTTON_CLASS}`).length > 0) return;

    const button = $(
      `<button type="button" class="${BUTTON_CLASS}">
        <i class="${BUTTON_ICON}"></i>
        <span>${BUTTON_TEXT}</span>
      </button>`,
    );
    button.css({
      display: "inline-flex",
      "align-items": "center",
      gap: "6px",
      padding: "4px 8px",
      "font-size": "12px",
      "line-height": "1.1",
      cursor: "pointer",
    });

    button.on("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      const openRouterClient = game.handyDandy?.openRouterClient;
      if (!openRouterClient || typeof openRouterClient.generateImage !== "function") {
        ui.notifications?.error(`${CONSTANTS.MODULE_NAME} | AI image generation is unavailable.`);
        return;
      }

      void (async () => {
        const itemName = item.name?.trim() || "Unnamed Item";
        const slugCandidate = (item as Item & { system?: { slug?: unknown } }).system?.slug;
        const itemSlug = typeof slugCandidate === "string" && slugCandidate.trim().length > 0
          ? slugCandidate.trim()
          : toSlug(itemName) || `item-${Date.now().toString(36)}`;
        const itemDescription = resolveItemDescription(item);
        const defaultPrompt = buildItemImagePrompt({
          itemName,
          itemSlug,
          itemDescription,
        });
        const request = await promptImageGenerationRequest({
          title: `${CONSTANTS.MODULE_NAME} | Item Image`,
          modeLabel: "Item Icon Art",
          subjectName: itemName,
          defaultPrompt,
          promptNotes: "This starts with the default icon prompt. Edit only if you need custom direction.",
        });
        if (!request) {
          return;
        }

        setBusy(button, true);
        try {
          const imagePath = await generateItemImage(openRouterClient, {
            itemName,
            itemSlug,
            itemDescription,
            promptOverride: request.prompt,
            referenceImage: request.referenceImage,
            existingImagePath: item.img,
          });

          await item.update({ img: imagePath });
          ui.notifications?.info(`${CONSTANTS.MODULE_NAME} | Generated image for ${itemName}.`);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          ui.notifications?.error(`${CONSTANTS.MODULE_NAME} | Item image generation failed: ${message}`);
          console.error(`${CONSTANTS.MODULE_NAME} | Item image generation failed`, error);
        } finally {
          setBusy(button, false);
        }
      })();
    });

    stack.append(button);
  });
}

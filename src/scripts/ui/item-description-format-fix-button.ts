import { CONSTANTS } from "../constants";
import { repairPf2eInlineMacros } from "../text/pf2e-rich-text";

const STACK_CLASS = "handy-dandy-item-image-stack" as const;
const BUTTON_CLASS = "handy-dandy-item-description-format-fix" as const;
const BUTTON_ICON = "fas fa-wand-magic-sparkles" as const;
const BUTTON_TEXT = "Fix Format" as const;

function setBusy(button: JQuery<HTMLElement>, busy: boolean): void {
  button.prop("disabled", busy);
  const icon = button.find("i");
  icon.attr("class", busy ? "fas fa-spinner fa-spin" : BUTTON_ICON);
}

function resolveItemDescriptionValue(item: Item): string | null {
  const candidate = (item as Item & { system?: { description?: { value?: unknown } } }).system?.description?.value;
  return typeof candidate === "string" ? candidate : null;
}

export function registerItemDescriptionFormatFixButton(): void {
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

      const currentDescription = resolveItemDescriptionValue(item);
      if (!currentDescription || !currentDescription.trim()) {
        ui.notifications?.warn(`${CONSTANTS.MODULE_NAME} | This item has no description text to reformat.`);
        return;
      }

      void (async () => {
        setBusy(button, true);
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
          setBusy(button, false);
        }
      })();
    });

    stack.append(button);
  });
}

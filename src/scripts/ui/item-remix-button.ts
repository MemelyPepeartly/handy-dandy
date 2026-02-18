import { runItemRemixFlow } from "../flows/item-remix";

const BUTTON_CLASS = "handy-dandy-item-remix-button" as const;
const BUTTON_ICON_CLASS = "fas fa-random" as const;
const BUTTON_LABEL = "Remix" as const;
const BUTTON_TITLE = "Open Handy Dandy item remix" as const;

export function registerItemRemixButton(): void {
  Hooks.on("renderItemSheetPF2e", (app: ItemSheet, html: JQuery<HTMLElement>) => {
    const item = app.item ?? app.document;
    if (!(item instanceof Item)) return;

    const user = game.user;
    if (!user) return;
    if (!user.isGM && !item.isOwner) return;

    const windowHeader = html.find(".window-header");
    if (windowHeader.length === 0) return;

    if (windowHeader.find(`.${BUTTON_CLASS}`).length > 0) return;

    const closeButton = windowHeader.find(".close");
    const button = $(
      `<a class="${BUTTON_CLASS}" title="${BUTTON_TITLE}">
        <i class="${BUTTON_ICON_CLASS}"></i>
        <span>${BUTTON_LABEL}</span>
      </a>`,
    );

    if (closeButton.length > 0) {
      closeButton.before(button);
    } else {
      windowHeader.append(button);
    }

    button.on("click", (event) => {
      event.preventDefault();
      void runItemRemixFlow(item);
    });
  });
}

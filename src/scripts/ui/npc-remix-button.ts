import { CONSTANTS } from "../constants";

const BUTTON_CLASS = "handy-dandy-npc-remix-button" as const;
const BUTTON_ICON_CLASS = "fas fa-random" as const;
const BUTTON_LABEL = "Remix Prompt" as const;
const BUTTON_TITLE = "Open the Handy Dandy prompt remix placeholder" as const;

export function registerNpcRemixButton(): void {
  Hooks.on("renderActorSheetPF2e", (app: ActorSheet, html: JQuery<HTMLElement>) => {
    const actor = app.actor;
    if (!(actor instanceof Actor)) return;

    const actorType = actor.type as unknown as string;
    if (actorType !== "npc") return;

    const user = game.user;
    if (!user) return;
    if (!user.isGM && !app.document?.isOwner) return;

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

    button.on("click", event => {
      event.preventDefault();
      openPlaceholderDialog(actor.name ?? CONSTANTS.MODULE_NAME);
    });
  });
}

function openPlaceholderDialog(actorName: string): void {
  const dialog = new Dialog({
    title: `${actorName} Prompt Remix`,
    content:
      "<p>This placeholder dialogue will host the upcoming prompt remix experience.</p>" +
      "<p>No actions are available yet, but stay tuned!</p>",
    buttons: {
      close: {
        icon: "<i class=\"fas fa-times\"></i>",
        label: "Close",
      },
    },
    default: "close",
  });

  dialog.render(true);
}

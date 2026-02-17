import { runNpcRemixFlow } from "../flows/npc-remix";

const BUTTON_BASE_CLASS = "handy-dandy-npc-remix-section-button" as const;
const BUTTON_ROW_CLASS = "handy-dandy-npc-remix-section-controls" as const;
const INVENTORY_BUTTON_CLASS = "handy-dandy-npc-remix-inventory-button" as const;
const SPELLS_BUTTON_CLASS = "handy-dandy-npc-remix-spells-button" as const;

function appendSectionButton(
  html: JQuery<HTMLElement>,
  selector: string,
  className: string,
  label: string,
  title: string,
  iconClass: string,
  onClick: () => void,
): void {
  const container = html.find(selector).first();
  if (container.length === 0) return;
  if (container.find(`.${className}`).length > 0) return;

  const controlsRow = (() => {
    const existing = container.children(`.${BUTTON_ROW_CLASS}`).first();
    if (existing.length > 0) {
      return existing;
    }

    const row = $(`<div class="${BUTTON_ROW_CLASS}"></div>`);
    row.css({
      display: "flex",
      "justify-content": "flex-end",
      "margin-bottom": "8px",
    });
    container.prepend(row);
    return row;
  })();

  const button = $(
    `<a class="${BUTTON_BASE_CLASS} ${className}" role="button" title="${title}" aria-label="${title}">
      <i class="${iconClass}"></i>
      <span>${label}</span>
    </a>`,
  );

  button.css({
    display: "inline-flex",
    "align-items": "center",
    gap: "6px",
    padding: "4px 8px",
    "border-radius": "999px",
    border: "1px solid rgba(0, 0, 0, 0.35)",
    background: "rgba(0, 0, 0, 0.55)",
    color: "#ffffff",
    "font-size": "12px",
    "line-height": "1",
    "z-index": "4",
  });

  button.on("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick();
  });

  controlsRow.append(button);
}

export function registerNpcRemixSectionButtons(): void {
  Hooks.on("renderActorSheetPF2e", (app: ActorSheet, html: JQuery<HTMLElement>) => {
    const actor = app.actor;
    if (!(actor instanceof Actor)) return;
    if ((actor.type as unknown as string) !== "npc") return;

    const user = game.user;
    if (!user) return;
    if (!user.isGM && !app.document?.isOwner) return;

    appendSectionButton(
      html,
      ".tab.inventory",
      INVENTORY_BUTTON_CLASS,
      "Remix Gear",
      "Remix NPC inventory and equipment",
      "fas fa-toolbox",
      () => {
        void runNpcRemixFlow(actor, {
          mode: "equipment",
          title: "Equipment Remix",
        });
      },
    );

    appendSectionButton(
      html,
      ".tab.spells",
      SPELLS_BUTTON_CLASS,
      "Remix Spells",
      "Remix NPC spellcasting entries and spells",
      "fas fa-book-sparkles",
      () => {
        void runNpcRemixFlow(actor, {
          mode: "spells",
          title: "Spellcasting Remix",
        });
      },
    );
  });
}

import { CONSTANTS } from "../constants";
import { generateTransparentTokenImage } from "../generation/token-image";

const BUTTON_CLASS = "handy-dandy-npc-portrait-regenerate" as const;
const BUTTON_ICON_CLASS = "fas fa-wand-magic-sparkles" as const;
const BUTTON_TITLE = "Generate portrait image" as const;

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
  const icon = button.find("i");
  icon.attr("class", busy ? "fas fa-spinner fa-spin" : BUTTON_ICON_CLASS);
  button.css("pointer-events", busy ? "none" : "auto");
  button.css("opacity", busy ? "0.75" : "1");
}

function getActorDescription(actor: Actor): string | null {
  const system = (actor as Actor & { system?: { details?: { publicNotes?: unknown } } }).system;
  const publicNotes = system?.details?.publicNotes;
  if (typeof publicNotes !== "string") {
    return null;
  }
  const text = stripHtml(publicNotes);
  return text.length > 0 ? text : null;
}

async function regenerateNpcPortrait(actor: Actor, button: JQuery<HTMLElement>): Promise<void> {
  const gptClient = game.handyDandy?.gptClient;
  if (!gptClient || typeof gptClient.generateImage !== "function") {
    ui.notifications?.error(`${CONSTANTS.MODULE_NAME} | GPT image generation is unavailable.`);
    return;
  }

  setBusy(button, true);
  try {
    const actorName = actor.name?.trim() || "Unnamed NPC";
    const slugCandidate = (actor as Actor & { system?: { slug?: unknown } }).system?.slug;
    const actorSlug = typeof slugCandidate === "string" && slugCandidate.trim().length > 0
      ? slugCandidate.trim()
      : toSlug(actorName) || `npc-${Date.now().toString(36)}`;

    const imagePath = await generateTransparentTokenImage(gptClient, {
      actorName,
      actorSlug,
      actorDescription: getActorDescription(actor),
      imageCategory: "actor",
    });

    const updateData: Record<string, unknown> = { img: imagePath };
    updateData["prototypeToken.texture.src"] = imagePath;
    await actor.update(updateData);

    ui.notifications?.info(`${CONSTANTS.MODULE_NAME} | Regenerated portrait for ${actorName}.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ui.notifications?.error(`${CONSTANTS.MODULE_NAME} | Portrait generation failed: ${message}`);
    console.error(`${CONSTANTS.MODULE_NAME} | Portrait generation failed`, error);
  } finally {
    setBusy(button, false);
  }
}

export function registerNpcPortraitRegenerateButton(): void {
  Hooks.on("renderActorSheetPF2e", (app: ActorSheet, html: JQuery<HTMLElement>) => {
    const actor = app.actor;
    if (!(actor instanceof Actor)) return;
    if ((actor.type as unknown as string) !== "npc") return;

    const user = game.user;
    if (!user) return;
    if (!user.isGM && !app.document?.isOwner) return;

    const imageContainer = html.find(".image-container").first();
    if (imageContainer.length === 0) return;
    if (imageContainer.find(`.${BUTTON_CLASS}`).length > 0) return;

    imageContainer.css("position", "relative");

    const button = $(
      `<a class="${BUTTON_CLASS}" title="${BUTTON_TITLE}" aria-label="${BUTTON_TITLE}">
        <i class="${BUTTON_ICON_CLASS}"></i>
      </a>`,
    );

    button.css({
      position: "absolute",
      top: "6px",
      right: "6px",
      width: "24px",
      height: "24px",
      display: "inline-flex",
      "align-items": "center",
      "justify-content": "center",
      "border-radius": "999px",
      border: "1px solid rgba(0, 0, 0, 0.4)",
      background: "rgba(0, 0, 0, 0.55)",
      color: "#ffffff",
      "z-index": "3",
    });

    button.on("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void regenerateNpcPortrait(actor, button);
    });

    imageContainer.append(button);
  });
}

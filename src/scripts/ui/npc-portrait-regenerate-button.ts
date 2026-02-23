import { CONSTANTS } from "../constants";
import { buildTransparentTokenPrompt, generateTransparentTokenImage } from "../generation/token-image";

const BUTTON_CLASS = "handy-dandy-npc-portrait-regenerate" as const;
const BUTTON_ICON_CLASS = "fas fa-wand-magic-sparkles" as const;
const BUTTON_TITLE = "Generate portrait image" as const;

type PortraitGenerationRequest = {
  prompt: string;
  referenceImage: File | null;
};

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

async function promptPortraitGenerationRequest(
  actorName: string,
  defaultPrompt: string,
): Promise<PortraitGenerationRequest | null> {
  const content = `
    <form class="handy-dandy-npc-portrait-remix-form" style="display:flex;flex-direction:column;gap:0.75rem;min-width:640px;">
      <p class="notes">Generate portrait art for <strong>${escapeHtml(actorName)}</strong>.</p>
      <div class="form-group">
        <label for="handy-dandy-npc-reference-image">Reference Image (optional)</label>
        <input id="handy-dandy-npc-reference-image" type="file" name="referenceImage" accept="image/png,image/jpeg,image/webp" />
        <p class="notes">Provide a reference image to guide style, colors, or creature traits.</p>
      </div>
      <div class="form-group">
        <label for="handy-dandy-npc-image-prompt">Image Prompt</label>
        <textarea id="handy-dandy-npc-image-prompt" name="prompt" rows="10">${escapeHtml(defaultPrompt)}</textarea>
        <p class="notes">This is the current default prompt. Edit it only if you want to override behavior.</p>
      </div>
    </form>
  `;

  return await new Promise<PortraitGenerationRequest | null>((resolve) => {
    let settled = false;
    const finish = (value: PortraitGenerationRequest | null): void => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };

    const dialog = new Dialog(
      {
        title: `${CONSTANTS.MODULE_NAME} | Portrait Remix`,
        content,
        buttons: {
          generate: {
            icon: '<i class="fas fa-wand-magic-sparkles"></i>',
            label: "Generate",
            callback: (html) => {
              const form = html[0]?.querySelector("form");
              if (!(form instanceof HTMLFormElement)) {
                finish(null);
                return;
              }

              const formData = new FormData(form);
              const input = form.querySelector('input[name="referenceImage"]');
              const referenceImage = input instanceof HTMLInputElement
                ? input.files?.[0] ?? null
                : null;

              finish({
                prompt: String(formData.get("prompt") ?? defaultPrompt),
                referenceImage,
              });
            },
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: "Cancel",
            callback: () => finish(null),
          },
        },
        default: "generate",
        close: () => finish(null),
      },
      { jQuery: true, width: 780 },
    );

    dialog.render(true);
  });
}

async function regenerateNpcPortrait(actor: Actor, button: JQuery<HTMLElement>): Promise<void> {
  const openRouterClient = game.handyDandy?.openRouterClient;
  if (!openRouterClient || typeof openRouterClient.generateImage !== "function") {
    ui.notifications?.error(`${CONSTANTS.MODULE_NAME} | AI image generation is unavailable.`);
    return;
  }

  const actorName = actor.name?.trim() || "Unnamed NPC";
  const slugCandidate = (actor as Actor & { system?: { slug?: unknown } }).system?.slug;
  const actorSlug = typeof slugCandidate === "string" && slugCandidate.trim().length > 0
    ? slugCandidate.trim()
    : toSlug(actorName) || `npc-${Date.now().toString(36)}`;
  const actorDescription = getActorDescription(actor);
  const defaultPrompt = buildTransparentTokenPrompt({
    actorName,
    actorSlug,
    actorDescription,
    imageCategory: "actor",
  });

  const request = await promptPortraitGenerationRequest(actorName, defaultPrompt);
  if (!request) {
    return;
  }

  setBusy(button, true);
  try {
    const prompt = request.prompt.trim() || defaultPrompt;

    const imagePath = await generateTransparentTokenImage(openRouterClient, {
      actorName,
      actorSlug,
      actorDescription,
      promptOverride: prompt,
      referenceImage: request.referenceImage,
      imageCategory: "actor",
      existingImagePath: actor.img,
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

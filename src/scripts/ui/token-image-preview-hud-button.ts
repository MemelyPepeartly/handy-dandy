import { CONSTANTS } from "../constants";

const BUTTON_CLASS = "handy-dandy-token-image-preview" as const;
const BUTTON_ICON_CLASS = "fas fa-image" as const;
const BUTTON_TITLE = "Show Token Image" as const;

type TokenHUDData = {
  _id?: unknown;
};

type TokenHUDLike = {
  object?: Token.Object | null;
};

function resolveHudRootElement(html: unknown): HTMLElement | null {
  if (typeof HTMLElement === "undefined") {
    return null;
  }

  if (html instanceof HTMLElement) {
    return html;
  }

  if (!html || typeof html !== "object") {
    return null;
  }

  const candidate = (html as { [index: number]: unknown })[0];
  return candidate instanceof HTMLElement ? candidate : null;
}

function resolveHudToken(app: unknown, data: unknown): Token.Object | null {
  const tokenFromHud = (app as TokenHUDLike | undefined)?.object;
  if (tokenFromHud) {
    return tokenFromHud;
  }

  const tokenId = typeof (data as TokenHUDData | undefined)?._id === "string"
    ? (data as TokenHUDData)._id
    : "";
  if (!tokenId) {
    return null;
  }

  const placeables = canvas.tokens?.placeables ?? [];
  return placeables.find((token) => token.id === tokenId) ?? null;
}

function resolveTokenImagePath(token: Token.Object): string | null {
  const tokenDocument = token.document as TokenDocument & {
    texture?: {
      src?: unknown;
    };
  };

  const source = tokenDocument.texture?.src;
  if (typeof source !== "string") {
    return null;
  }

  const trimmed = source.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveTokenDisplayName(token: Token.Object): string {
  const actorName = token.actor?.name?.trim();
  if (actorName) {
    return actorName;
  }

  const tokenName = token.name?.trim();
  if (tokenName) {
    return tokenName;
  }

  return "Token";
}

function createPreviewButton(token: Token.Object): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.classList.add("control-icon", BUTTON_CLASS);
  button.dataset.action = "handy-dandy-show-token-image";
  button.dataset.tooltip = BUTTON_TITLE;
  button.ariaLabel = BUTTON_TITLE;
  button.title = BUTTON_TITLE;
  button.innerHTML = `<i class="${BUTTON_ICON_CLASS}"></i>`;

  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();

    const imagePath = resolveTokenImagePath(token);
    if (!imagePath) {
      ui.notifications?.warn(`${CONSTANTS.MODULE_NAME} | Token image source is empty.`);
      return;
    }

    const title = `${resolveTokenDisplayName(token)} | Current Token Image`;
    new ImagePopout(imagePath, {
      title,
      shareable: false,
      uuid: token.document.uuid,
    }).render(true);
  });

  return button;
}

export function registerTokenImagePreviewHudButton(): void {
  Hooks.on("renderTokenHUD", (app: unknown, html: unknown, data: unknown) => {
    if (!game.user?.isGM) {
      return;
    }

    const root = resolveHudRootElement(html);
    if (!root) {
      return;
    }

    if (root.querySelector(`.${BUTTON_CLASS}`)) {
      return;
    }

    const token = resolveHudToken(app, data);
    if (!token || !resolveTokenImagePath(token)) {
      return;
    }

    const targetColumn =
      root.querySelector<HTMLElement>(".col.right") ??
      root.querySelector<HTMLElement>(".right") ??
      root;

    targetColumn.appendChild(createPreviewButton(token));
  });
}

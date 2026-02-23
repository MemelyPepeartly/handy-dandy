import { CONSTANTS } from "../constants";
import { initializeOpenRouterClientFromSettings } from "../openrouter/runtime";
import { canUseDesktopOpenRouterOAuth, connectWithOpenRouter } from "../openrouter/oauth";

interface OpenRouterAccountViewData {
  isConnected: boolean;
  keyPreview: string;
  authMethodLabel: string;
  manualApiKey: string;
}

interface SettingsAccessor {
  get: (namespace: string, key: string) => unknown;
  set: (namespace: string, key: string, value: unknown) => Promise<unknown>;
}

const getSettingsAccessor = (): SettingsAccessor | null => {
  const settings = game.settings;
  if (!settings) {
    return null;
  }
  return settings as unknown as SettingsAccessor;
};

const readStringSetting = (key: string): string => {
  const settings = getSettingsAccessor();
  if (!settings) {
    return "";
  }

  try {
    const value = settings.get(CONSTANTS.MODULE_ID, key);
    return typeof value === "string" ? value.trim() : "";
  } catch {
    return "";
  }
};

const summarizeApiKey = (apiKey: string): string => {
  if (apiKey.length <= 8) {
    return "****";
  }
  return `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`;
};

const authMethodLabel = (method: string): string => {
  if (method === "oauth") return "Connected via OpenRouter OAuth";
  if (method === "manual") return "Connected via manually entered API key";
  return "Connected";
};

const shouldForceDesktopOAuth = (): boolean => {
  try {
    const url = new URL(window.location.href);
    const isLocalHost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (!isLocalHost) {
      return false;
    }

    // OpenRouter browser OAuth requires HTTPS:443/3000 or localhost:3000.
    // Local Foundry commonly runs at http://localhost:30000, which must use desktop flow.
    if (url.protocol === "http:" && url.port !== "3000") {
      return true;
    }

    return false;
  } catch {
    return false;
  }
};

const isLocalInsecureOrigin = (): boolean => {
  try {
    const url = new URL(window.location.href);
    const isLocalHost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    return isLocalHost && url.protocol === "http:" && url.port !== "3000";
  } catch {
    return false;
  }
};

export class OpenRouterAccountSettings extends FormApplication {
  #isBusy = false;

  constructor(options?: Partial<FormApplicationOptions>) {
    super(undefined, options);
  }

  static override get defaultOptions(): FormApplicationOptions {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "handy-dandy-openrouter-account",
      title: "OpenRouter Account",
      template: `${CONSTANTS.TEMPLATE_PATH}/openrouter-account.hbs`,
      width: 560,
      height: "auto",
      closeOnSubmit: false,
      submitOnChange: false,
      classes: ["handy-dandy", "openrouter-account"],
    });
  }

  override async getData(): Promise<OpenRouterAccountViewData> {
    const apiKey = readStringSetting("OpenRouterApiKey");
    const method = readStringSetting("OpenRouterAuthMethod");

    return {
      isConnected: apiKey.length > 0,
      keyPreview: apiKey.length > 0 ? summarizeApiKey(apiKey) : "",
      authMethodLabel: authMethodLabel(method),
      manualApiKey: apiKey,
    };
  }

  override activateListeners(html: JQuery): void {
    super.activateListeners(html);

    html.find<HTMLButtonElement>("button[data-action='oauth-connect']").on("click", (event) => {
      event.preventDefault();
      void this.#onOAuthConnectRequested();
    });

    html.find<HTMLButtonElement>("button[data-action='disconnect']").on("click", (event) => {
      event.preventDefault();
      void this.#onDisconnect();
    });
  }

  protected override async _updateObject(
    _event: Event,
    formData: Record<string, unknown>,
  ): Promise<void> {
    const settings = getSettingsAccessor();
    if (!settings) {
      throw new Error(`${CONSTANTS.MODULE_NAME} | Settings are not available.`);
    }

    const apiKeyValue = formData["manualApiKey"];
    const apiKey = typeof apiKeyValue === "string" ? apiKeyValue.trim() : "";

    await settings.set(CONSTANTS.MODULE_ID, "OpenRouterApiKey", apiKey);
    await settings.set(CONSTANTS.MODULE_ID, "OpenRouterAuthMethod", apiKey ? "manual" : "");

    initializeOpenRouterClientFromSettings();

    if (apiKey) {
      ui.notifications?.info(`${CONSTANTS.MODULE_NAME} | OpenRouter API key saved for your user.`);
    } else {
      ui.notifications?.info(`${CONSTANTS.MODULE_NAME} | OpenRouter API key removed for your user.`);
    }

    this.render();
  }

  async #onOAuthConnectRequested(): Promise<void> {
    if (this.#isBusy) {
      return;
    }

    if (shouldForceDesktopOAuth()) {
      ui.notifications?.info(`${CONSTANTS.MODULE_NAME} | Opening OpenRouter login in your default browser.`);
      await this.#onOAuthConnect({ mode: "desktop" });
      return;
    }

    if (isLocalInsecureOrigin() && !canUseDesktopOpenRouterOAuth()) {
      ui.notifications?.warn(
        `${CONSTANTS.MODULE_NAME} | Local browser OAuth on this Foundry URL may fail OpenRouter restrictions. ` +
          `If it fails, use desktop Foundry OAuth flow or manual API key.`,
      );
    }

    const useExternalBrowser = canUseDesktopOpenRouterOAuth();

    if (useExternalBrowser) {
      ui.notifications?.info(`${CONSTANTS.MODULE_NAME} | Complete OpenRouter login in your default browser.`);
      await this.#onOAuthConnect({ mode: "auto" });
      return;
    }

    ui.notifications?.info(`${CONSTANTS.MODULE_NAME} | Complete OpenRouter login in the new tab.`);
    await this.#onOAuthConnect({ mode: "auto" });
  }

  async #onOAuthConnect(options: { mode: "auto" | "browser" | "desktop" }): Promise<void> {
    if (this.#isBusy) {
      return;
    }

    this.#isBusy = true;
    try {
      const settings = getSettingsAccessor();
      if (!settings) {
        throw new Error("Settings are not available.");
      }

      const apiKey = await connectWithOpenRouter({
        mode: options.mode,
      });
      await settings.set(CONSTANTS.MODULE_ID, "OpenRouterApiKey", apiKey);
      await settings.set(CONSTANTS.MODULE_ID, "OpenRouterAuthMethod", "oauth");
      initializeOpenRouterClientFromSettings();
      ui.notifications?.info(`${CONSTANTS.MODULE_NAME} | OpenRouter account connected for your user.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("Failed to create or update app while creating auth code")) {
        ui.notifications?.error(
          `${CONSTANTS.MODULE_NAME} | OpenRouter could not register this Foundry URL for OAuth. ` +
            `Use HTTPS on port 443/3000 (or localhost:3000), or use a manual API key.`,
        );
        console.error(`${CONSTANTS.MODULE_NAME} | OpenRouter OAuth app registration failed`, error);
        return;
      }
      if (message.includes("OpenRouter OAuth requires HTTPS on port 443 or 3000")) {
        ui.notifications?.error(
          `${CONSTANTS.MODULE_NAME} | Browser OAuth requires HTTPS:443/3000 or localhost:3000. ` +
            `For Foundry desktop, the module now uses external-browser OAuth with localhost:3000 callback.`,
        );
        return;
      }
      if (
        message.includes("Desktop OAuth requires Foundry desktop runtime.") ||
        message.includes("Desktop OAuth callback server is unavailable in this runtime.") ||
        message.includes("Unable to start local OAuth callback server on localhost:3000.")
      ) {
        ui.notifications?.error(
          `${CONSTANTS.MODULE_NAME} | Desktop OAuth callback runtime is unavailable. ` +
            `Use the module in Foundry desktop with desktop callback support, or paste a manual OpenRouter API key.`,
        );
        return;
      }
      ui.notifications?.error(`${CONSTANTS.MODULE_NAME} | OpenRouter login failed: ${message}`);
    } finally {
      this.#isBusy = false;
      this.render();
    }
  }

  async #onDisconnect(): Promise<void> {
    if (this.#isBusy) {
      return;
    }

    this.#isBusy = true;
    try {
      const settings = getSettingsAccessor();
      if (!settings) {
        throw new Error("Settings are not available.");
      }

      const userApiKey = readStringSetting("OpenRouterApiKey");
      if (!userApiKey) {
        ui.notifications?.info(`${CONSTANTS.MODULE_NAME} | No user-scoped OpenRouter key is currently connected.`);
        return;
      }

      await settings.set(CONSTANTS.MODULE_ID, "OpenRouterApiKey", "");
      await settings.set(CONSTANTS.MODULE_ID, "OpenRouterAuthMethod", "");
      initializeOpenRouterClientFromSettings();
      ui.notifications?.info(`${CONSTANTS.MODULE_NAME} | OpenRouter account disconnected for your user.`);
    } finally {
      this.#isBusy = false;
      this.render();
    }
  }
}

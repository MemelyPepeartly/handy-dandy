import { OpenAI } from "openai";
import { CONSTANTS } from "../constants";
import { OpenRouterClient } from "./client";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

const safeReadSetting = (key: string): unknown => {
  try {
    return game.settings?.get(CONSTANTS.MODULE_ID as never, key as never);
  } catch {
    return undefined;
  }
};

const readSettingString = (key: string): string => {
  const value = safeReadSetting(key);
  return typeof value === "string" ? value.trim() : "";
};

export function readConfiguredApiKey(): string {
  return readSettingString("OpenRouterApiKey");
}

export function createOpenRouterSdk(apiKey: string): OpenAI {
  return new OpenAI({
    apiKey,
    baseURL: OPENROUTER_BASE_URL,
    dangerouslyAllowBrowser: true,
    defaultHeaders: {
      "HTTP-Referer": window.location.origin,
      "X-Title": CONSTANTS.MODULE_NAME,
    },
  });
}

export function initializeOpenRouterClientFromSettings(): void {
  const namespace = game.handyDandy;
  if (!namespace) {
    return;
  }

  const apiKey = readConfiguredApiKey();
  if (!apiKey) {
    namespace.openRouterSdk = null;
    namespace.openRouterClient = null;
    return;
  }

  const openRouterSdk = createOpenRouterSdk(apiKey);
  namespace.openRouterSdk = openRouterSdk;
  namespace.openRouterClient = OpenRouterClient.fromSettings(openRouterSdk);
}

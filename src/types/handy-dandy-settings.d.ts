/** Handy-Dandy - custom settings namespace **/
export {};

declare module "fvtt-types/configuration" {
  type HandyDandyOpenRouterModel = import("../scripts/openrouter/models").OpenRouterModelId;
  type HandyDandyOpenRouterImageModel = import("../scripts/openrouter/models").OpenRouterImageModelId;

  interface SettingConfig {
    /**
     * OpenRouter settings
     */
    "handy-dandy.OpenRouterApiKey": string;
    "handy-dandy.OpenRouterAuthMethod": string;
    "handy-dandy.OpenRouterModel": HandyDandyOpenRouterModel;
    "handy-dandy.OpenRouterImageModel": HandyDandyOpenRouterImageModel;
    "handy-dandy.OpenRouterTemperature": number;
    "handy-dandy.OpenRouterTopP": number;
    "handy-dandy.OpenRouterSeed": number;

    "handy-dandy.GeneratedImageDirectory": string;
    "handy-dandy.developerDumpInvalidJson": boolean;
    "handy-dandy.developerDumpAjvErrors": boolean;
  }
}

export {};

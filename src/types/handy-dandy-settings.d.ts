/** Handy-Dandy - custom settings namespace **/
export {};

declare module "fvtt-types/configuration" {
  type HandyDandyGPTModel = import("../scripts/gpt/models").GPTModelId;
  type HandyDandyGPTImageModel = import("../scripts/gpt/models").GPTImageModelId;

  interface SettingConfig {
    /**
     * OpenRouter settings
     */
    "handy-dandy.OpenRouterApiKey": string;
    "handy-dandy.OpenRouterAuthMethod": string;
    "handy-dandy.OpenRouterModel": HandyDandyGPTModel;
    "handy-dandy.OpenRouterImageModel": HandyDandyGPTImageModel;
    "handy-dandy.OpenRouterTemperature": number;
    "handy-dandy.OpenRouterTopP": number;
    "handy-dandy.OpenRouterSeed": number;

    "handy-dandy.GeneratedImageDirectory": string;
    "handy-dandy.developerDumpInvalidJson": boolean;
    "handy-dandy.developerDumpAjvErrors": boolean;
  }
}

export {};

/** Handy-Dandy - custom settings namespace **/
export {};

declare module "fvtt-types/configuration" {
  type HandyDandyGPTModel = import("../scripts/gpt/models").GPTModelId;
  type HandyDandyGPTImageModel = import("../scripts/gpt/models").GPTImageModelId;
  interface SettingConfig {
    /**
     * Settings owned by the Handy-Dandy module
     */
    "handy-dandy.GPTApiKey": string;
    "handy-dandy.GPTOrganization": string;
    "handy-dandy.GPTModel": HandyDandyGPTModel;
    "handy-dandy.GPTImageModel": HandyDandyGPTImageModel;
    "handy-dandy.GeneratedImageDirectory": string;
    "handy-dandy.GPTTemperature": number;
    "handy-dandy.GPTTopP": number;
    "handy-dandy.GPTSeed": number;
    "handy-dandy.developerDumpInvalidJson": boolean;
    "handy-dandy.developerDumpAjvErrors": boolean;
  }
}

export {};

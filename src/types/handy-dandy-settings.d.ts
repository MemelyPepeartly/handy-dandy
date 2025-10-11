/** Handy-Dandy – custom settings namespace **/
export {};

declare module "fvtt-types/configuration" {
  interface SettingConfig {
    /**
     * Settings owned by the Handy-Dandy module
     */
    "handy-dandy.GPTApiKey": string;
    "handy-dandy.GPTOrganization": string;
    "handy-dandy.GPTModel": string;
    "handy-dandy.GPTTemperature": number;
    "handy-dandy.GPTTopP": number;
    "handy-dandy.GPTSeed": number | null;
  }
}

export {};
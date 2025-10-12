/** Handy-Dandy – custom flags namespace **/
export {};

declare module "fvtt-types/configuration" {
  interface FlagConfig {
    User: {
      "handy-dandy": {
        workbenchHistory: unknown[];
      };
    };
  }
}

/** Handy-Dandy custom flags namespace */
import type { MapMarkerData, MapMarkerDefaults } from "../scripts/map-markers/types";

export {};

declare module "fvtt-types/configuration" {
  interface FlagConfig {
    Scene: {
      "handy-dandy": {
        mapMarkers: MapMarkerData[];
      };
    };
    User: {
      "handy-dandy": {
        workbenchHistory: unknown[];
        mapMarkerDefaults: MapMarkerDefaults;
      };
    };
  }
}

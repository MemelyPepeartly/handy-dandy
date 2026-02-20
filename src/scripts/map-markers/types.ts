export const MAP_MARKER_SCENE_FLAG_KEY = "mapMarkers" as const;
export const MAP_MARKER_DEFAULTS_USER_FLAG_KEY = "mapMarkerDefaults" as const;

export type MapMarkerKind = "map-note" | "specific-room";
export type MapMarkerDisplayMode = "number" | "icon";

export interface MapMarkerDefaults {
  prompt: string;
  areaTheme: string;
}

export interface MapMarkerData {
  id: string;
  x: number;
  y: number;
  kind: MapMarkerKind;
  prompt: string;
  areaTheme: string;
  boxText: string;
  hidden: boolean;
  displayMode: MapMarkerDisplayMode;
  numberLabel: string;
  iconSymbol: string;
  createdAt: number;
  updatedAt: number;
}

export interface MapMarkerSeed {
  x: number;
  y: number;
  defaults: MapMarkerDefaults;
  existing: readonly MapMarkerData[];
}

export const MAP_MARKER_ICON_OPTIONS = ["*", "!", "?", "#", "+"] as const;
export const DEFAULT_MAP_MARKER_ICON = MAP_MARKER_ICON_OPTIONS[0];

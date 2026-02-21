export const MAP_MARKER_SCENE_FLAG_KEY = "mapMarkers" as const;
export const MAP_MARKER_DEFAULTS_USER_FLAG_KEY = "mapMarkerDefaults" as const;

export type MapMarkerKind = "map-note" | "specific-room";
export type MapMarkerDisplayMode = "number" | "icon";
export type MapMarkerTone = "neutral" | "mysterious" | "ominous" | "wondrous" | "grim" | "lively";
export type MapMarkerBoxTextLength = "short" | "medium" | "long";

export interface MapMarkerDefaults {
  prompt: string;
  areaTheme: string;
  tone: MapMarkerTone;
  boxTextLength: MapMarkerBoxTextLength;
}

export interface MapMarkerData {
  id: string;
  x: number;
  y: number;
  kind: MapMarkerKind;
  title: string;
  prompt: string;
  areaTheme: string;
  sensoryDetails: string;
  notableFeatures: string;
  occupants: string;
  hazards: string;
  gmNotes: string;
  tone: MapMarkerTone;
  boxTextLength: MapMarkerBoxTextLength;
  includeGmNotes: boolean;
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
export const DEFAULT_MAP_MARKER_TONE: MapMarkerTone = "neutral";
export const DEFAULT_MAP_MARKER_BOXTEXT_LENGTH: MapMarkerBoxTextLength = "medium";

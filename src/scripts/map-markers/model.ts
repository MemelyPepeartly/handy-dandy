import {
  DEFAULT_MAP_MARKER_BOXTEXT_LENGTH,
  DEFAULT_MAP_MARKER_ICON,
  DEFAULT_MAP_MARKER_TONE,
  type MapMarkerData,
  type MapMarkerBoxTextLength,
  type MapMarkerDefaults,
  type MapMarkerDisplayMode,
  type MapMarkerKind,
  type MapMarkerSeed,
  type MapMarkerTone,
} from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function normalizeNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeMarkerKind(value: unknown): MapMarkerKind {
  return value === "specific-room" ? "specific-room" : "map-note";
}

function normalizeDisplayMode(value: unknown): MapMarkerDisplayMode {
  return value === "icon" ? "icon" : "number";
}

function normalizeTone(value: unknown): MapMarkerTone {
  switch (value) {
    case "mysterious":
    case "ominous":
    case "wondrous":
    case "grim":
    case "lively":
      return value;
    default:
      return DEFAULT_MAP_MARKER_TONE;
  }
}

function normalizeBoxTextLength(value: unknown): MapMarkerBoxTextLength {
  switch (value) {
    case "short":
    case "long":
      return value;
    default:
      return DEFAULT_MAP_MARKER_BOXTEXT_LENGTH;
  }
}

export function normalizeMapMarkerDefaults(value: unknown): MapMarkerDefaults {
  if (!isRecord(value)) {
    return {
      prompt: "",
      areaTheme: "",
      tone: DEFAULT_MAP_MARKER_TONE,
      boxTextLength: DEFAULT_MAP_MARKER_BOXTEXT_LENGTH,
    };
  }

  return {
    prompt: normalizeString(value["prompt"]),
    areaTheme: normalizeString(value["areaTheme"]),
    tone: normalizeTone(value["tone"]),
    boxTextLength: normalizeBoxTextLength(value["boxTextLength"]),
  };
}

export function resolveNextMarkerNumber(existing: readonly MapMarkerData[]): number {
  const numbers = existing
    .map((marker) => Number.parseInt(marker.numberLabel, 10))
    .filter((value) => Number.isFinite(value));
  if (!numbers.length) {
    return 1;
  }

  return Math.max(...numbers) + 1;
}

export function createDefaultMapMarker(seed: MapMarkerSeed): MapMarkerData {
  const now = Date.now();

  return {
    id: foundry.utils.randomID(),
    x: seed.x,
    y: seed.y,
    kind: "specific-room",
    title: "",
    prompt: seed.defaults.prompt,
    areaTheme: seed.defaults.areaTheme,
    sensoryDetails: "",
    notableFeatures: "",
    occupants: "",
    hazards: "",
    gmNotes: "",
    tone: seed.defaults.tone,
    boxTextLength: seed.defaults.boxTextLength,
    includeGmNotes: false,
    boxText: "",
    hidden: false,
    displayMode: "number",
    numberLabel: String(resolveNextMarkerNumber(seed.existing)),
    iconSymbol: DEFAULT_MAP_MARKER_ICON,
    createdAt: now,
    updatedAt: now,
  };
}

export function normalizeMapMarker(value: unknown): MapMarkerData | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = normalizeString(value["id"]);
  const x = normalizeNumber(value["x"], Number.NaN);
  const y = normalizeNumber(value["y"], Number.NaN);
  if (!id || !Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  const createdAt = normalizeNumber(value["createdAt"], Date.now());
  const updatedAt = normalizeNumber(value["updatedAt"], createdAt);

  return {
    id,
    x,
    y,
    kind: normalizeMarkerKind(value["kind"]),
    title: normalizeString(value["title"]),
    prompt: normalizeString(value["prompt"]),
    areaTheme: normalizeString(value["areaTheme"]),
    sensoryDetails: normalizeString(value["sensoryDetails"]),
    notableFeatures: normalizeString(value["notableFeatures"]),
    occupants: normalizeString(value["occupants"]),
    hazards: normalizeString(value["hazards"]),
    gmNotes: normalizeString(value["gmNotes"]),
    tone: normalizeTone(value["tone"]),
    boxTextLength: normalizeBoxTextLength(value["boxTextLength"]),
    includeGmNotes: normalizeBoolean(value["includeGmNotes"]),
    boxText: normalizeString(value["boxText"]),
    hidden: normalizeBoolean(value["hidden"]),
    displayMode: normalizeDisplayMode(value["displayMode"]),
    numberLabel: normalizeString(value["numberLabel"], "1"),
    iconSymbol: normalizeString(value["iconSymbol"], DEFAULT_MAP_MARKER_ICON) || DEFAULT_MAP_MARKER_ICON,
    createdAt,
    updatedAt,
  };
}

export function normalizeMapMarkerList(value: unknown): MapMarkerData[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const dedupe = new Set<string>();
  const markers: MapMarkerData[] = [];
  for (const candidate of value) {
    const marker = normalizeMapMarker(candidate);
    if (!marker || dedupe.has(marker.id)) {
      continue;
    }

    dedupe.add(marker.id);
    markers.push(marker);
  }

  return markers;
}

export function touchMapMarker(marker: MapMarkerData): MapMarkerData {
  return {
    ...marker,
    updatedAt: Date.now(),
  };
}

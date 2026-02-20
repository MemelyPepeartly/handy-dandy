import {
  DEFAULT_MAP_MARKER_ICON,
  type MapMarkerData,
  type MapMarkerDefaults,
  type MapMarkerDisplayMode,
  type MapMarkerKind,
  type MapMarkerSeed,
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

export function normalizeMapMarkerDefaults(value: unknown): MapMarkerDefaults {
  if (!isRecord(value)) {
    return { prompt: "", areaTheme: "" };
  }

  return {
    prompt: normalizeString(value["prompt"]),
    areaTheme: normalizeString(value["areaTheme"]),
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
    prompt: seed.defaults.prompt,
    areaTheme: seed.defaults.areaTheme,
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
    prompt: normalizeString(value["prompt"]),
    areaTheme: normalizeString(value["areaTheme"]),
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

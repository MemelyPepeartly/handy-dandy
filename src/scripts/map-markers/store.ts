import { CONSTANTS } from "../constants";
import {
  normalizeMapMarkerDefaults,
  normalizeMapMarkerList,
  touchMapMarker,
} from "./model";
import type { MapMarkerData, MapMarkerDefaults } from "./types";
import {
  DEFAULT_MAP_MARKER_BOXTEXT_LENGTH,
  DEFAULT_MAP_MARKER_TONE,
  MAP_MARKER_DEFAULTS_USER_FLAG_KEY,
  MAP_MARKER_SCENE_FLAG_KEY,
} from "./types";

function getSceneFlagValue(scene: Scene): unknown {
  return scene.getFlag(CONSTANTS.MODULE_ID, MAP_MARKER_SCENE_FLAG_KEY);
}

export function getSceneMapMarkers(scene: Scene | null | undefined): MapMarkerData[] {
  if (!scene) {
    return [];
  }

  return normalizeMapMarkerList(getSceneFlagValue(scene));
}

export async function setSceneMapMarkers(scene: Scene, markers: readonly MapMarkerData[]): Promise<void> {
  await scene.setFlag(CONSTANTS.MODULE_ID, MAP_MARKER_SCENE_FLAG_KEY, [...markers]);
}

export async function addSceneMapMarker(scene: Scene, marker: MapMarkerData): Promise<void> {
  const markers = getSceneMapMarkers(scene);
  markers.push(marker);
  await setSceneMapMarkers(scene, markers);
}

export async function updateSceneMapMarker(
  scene: Scene,
  markerId: string,
  updater: (marker: MapMarkerData) => MapMarkerData,
): Promise<MapMarkerData | null> {
  const markers = getSceneMapMarkers(scene);
  const index = markers.findIndex((marker) => marker.id === markerId);
  if (index === -1) {
    return null;
  }

  const updated = touchMapMarker(updater(markers[index]));
  markers[index] = updated;
  await setSceneMapMarkers(scene, markers);
  return updated;
}

export async function removeSceneMapMarker(scene: Scene, markerId: string): Promise<boolean> {
  const markers = getSceneMapMarkers(scene);
  const next = markers.filter((marker) => marker.id !== markerId);
  if (next.length === markers.length) {
    return false;
  }

  await setSceneMapMarkers(scene, next);
  return true;
}

export function getUserMapMarkerDefaults(user: User | null | undefined): MapMarkerDefaults {
  if (!user) {
    return {
      prompt: "",
      areaTheme: "",
      tone: DEFAULT_MAP_MARKER_TONE,
      boxTextLength: DEFAULT_MAP_MARKER_BOXTEXT_LENGTH,
    };
  }

  return normalizeMapMarkerDefaults(user.getFlag(CONSTANTS.MODULE_ID, MAP_MARKER_DEFAULTS_USER_FLAG_KEY));
}

export async function setUserMapMarkerDefaults(
  user: User,
  defaults: MapMarkerDefaults,
): Promise<void> {
  await user.setFlag(CONSTANTS.MODULE_ID, MAP_MARKER_DEFAULTS_USER_FLAG_KEY, defaults);
}

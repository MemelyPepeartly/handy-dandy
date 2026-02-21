export const MAP_MARKER_LAYER_NAME = "handyDandyMapMarkers" as const;

type CanvasLayerEntry = {
  layerClass: typeof CanvasLayer;
  group: string;
};

class MapMarkerLayer extends InteractionLayer {
  static override get layerOptions(): InteractionLayer.LayerOptions {
    const merged = foundry.utils.mergeObject(super.layerOptions, {
      name: MAP_MARKER_LAYER_NAME,
      zIndex: 235,
    }) as InteractionLayer.LayerOptions;
    return merged;
  }
}

export function registerMapMarkerLayer(): void {
  const canvasConfig = CONFIG.Canvas as unknown as { layers?: Record<string, CanvasLayerEntry> } | undefined;
  const layers = canvasConfig?.layers;
  if (!layers || layers[MAP_MARKER_LAYER_NAME]) {
    return;
  }

  layers[MAP_MARKER_LAYER_NAME] = {
    layerClass: MapMarkerLayer as unknown as typeof CanvasLayer,
    group: "interface",
  };
}

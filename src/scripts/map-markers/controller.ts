import { CONSTANTS } from "../constants";
import { promptMapMarkerDialog } from "./dialog";
import { createDefaultMapMarker } from "./model";
import {
  addSceneMapMarker,
  getSceneMapMarkers,
  getUserMapMarkerDefaults,
  removeSceneMapMarker,
  setSceneMapMarkers,
  setUserMapMarkerDefaults,
  updateSceneMapMarker,
} from "./store";
import type { MapMarkerData } from "./types";

interface Point2D {
  x: number;
  y: number;
}

type MapMarkerDragState = {
  start: Point2D;
  positions: Map<string, Point2D>;
  offset: Point2D;
  moved: boolean;
};

type CanvasPointerEvent = {
  stopPropagation?: () => void;
  preventDefault?: () => void;
  button?: number;
  shiftKey?: boolean;
  target?: EventTarget | null;
  nativeEvent?: unknown;
  data?: {
    getLocalPosition?: (container: PIXI.Container) => PIXI.IPointData;
  };
  getLocalPosition?: (container: PIXI.Container) => PIXI.IPointData;
};

export type MapMarkerToolMode = "off" | "placement" | "select";

export const MAP_MARKER_CONTROL_NAME = "handy-dandy-map-notes" as const;
export const MAP_MARKER_PLACEMENT_TOOL_NAME = "map-marker-place" as const;
export const MAP_MARKER_SELECT_TOOL_NAME = "map-marker-select" as const;
const MAP_MARKER_VISIBILITY_BUTTON_CLASS = "handy-dandy-map-marker-visibility-toggle" as const;

function resolveCurrentSceneControlName(): string | null {
  const controls = ui.controls as { control?: { name?: unknown } } | undefined;
  const name = controls?.control?.name;
  return typeof name === "string" && name.length > 0 ? name : null;
}

function resolveCurrentSceneToolName(): string | null {
  const controls = ui.controls as {
    tool?: unknown;
    control?: { activeTool?: unknown };
  } | undefined;

  const activeTool = controls?.tool;
  if (typeof activeTool === "string" && activeTool.length > 0) {
    return activeTool;
  }

  const controlTool = controls?.control?.activeTool;
  return typeof controlTool === "string" && controlTool.length > 0 ? controlTool : null;
}

function resolveModeFromTool(toolName: string | null): MapMarkerToolMode {
  if (toolName === MAP_MARKER_SELECT_TOOL_NAME) {
    return "select";
  }
  if (toolName === MAP_MARKER_PLACEMENT_TOOL_NAME) {
    return "placement";
  }
  return "off";
}

class MapMarkerController {
  #initialised = false;
  #mode: MapMarkerToolMode = "off";
  #overlay: PIXI.Container | null = null;
  #markerSurface: PIXI.Container | null = null;
  #selectionGraphics: PIXI.Graphics | null = null;
  #lastTapByMarker = new Map<string, number>();
  #selectedMarkerIds = new Set<string>();
  #pointerDownStart: Point2D | null = null;
  #pointerDownLatest: Point2D | null = null;
  #pointerDragged = false;
  #dragState: MapMarkerDragState | null = null;
  #dragPreviewPositions: Map<string, Point2D> | null = null;
  #stageMouseDownListener: ((event: PIXI.FederatedPointerEvent) => void) | null = null;
  #stageMouseMoveListener: ((event: PIXI.FederatedPointerEvent) => void) | null = null;
  #stageMouseUpListener: ((event: PIXI.FederatedPointerEvent) => void) | null = null;
  #stageRightDownListener: ((event: PIXI.FederatedPointerEvent) => void) | null = null;
  #windowKeyDownListener: ((event: KeyboardEvent) => void) | null = null;
  #visibilityToggleButton: HTMLButtonElement | null = null;
  #visibilityToggleTargetMarkerId: string | null = null;

  initialize(): void {
    if (this.#initialised) {
      return;
    }

    this.#initialised = true;

    Hooks.on("canvasReady", () => {
      this.#syncModeFromSceneControls();
      this.#mountCanvasOverlay();
      this.renderMarkers();
    });

    Hooks.on("canvasTearDown", () => {
      this.#teardownCanvasOverlay();
    });

    Hooks.on("updateScene", (scene: Scene) => {
      if (!canvas.ready || scene.id !== canvas.scene?.id) {
        return;
      }
      this.renderMarkers();
    });

    Hooks.on("renderSceneControls", () => {
      this.#syncModeFromSceneControls();
    });
  }

  setMode(mode: MapMarkerToolMode): void {
    const canUse = !!game.user?.isGM;
    const nextMode: MapMarkerToolMode = canUse ? mode : "off";
    if (nextMode !== "select") {
      this.#clearSelection();
      this.#clearSelectionBox();
      this.#clearDragState();
      this.#hideVisibilityToggleButton();
    }

    this.#mode = nextMode;
    this.renderMarkers();
  }

  renderMarkers(): void {
    const surface = this.#markerSurface;
    if (!surface || !canvas.scene) {
      return;
    }

    const markers = getSceneMapMarkers(canvas.scene);
    this.#pruneSelection(markers);
    this.#clearContainer(surface);

    const visibleMarkers = markers.filter((marker) => !(marker.hidden && !game.user?.isGM));
    for (const marker of visibleMarkers) {
      const dragPosition = this.#dragPreviewPositions?.get(marker.id) ?? null;
      const display = this.#createMarkerDisplay(
        marker,
        this.#selectedMarkerIds.has(marker.id),
        dragPosition,
      );
      surface.addChild(display);
    }
  }

  #resolveMarkerSize(): number {
    const dimensions = canvas.dimensions as { size?: unknown } | undefined;
    const grid = canvas.grid as { size?: unknown } | undefined;
    const candidate = Number(dimensions?.size ?? grid?.size ?? 100);
    if (!Number.isFinite(candidate) || candidate <= 8) {
      return 100;
    }

    return Math.round(candidate);
  }

  #snapToGrid(point: Point2D): Point2D {
    const grid = canvas.grid as {
      getCenter?: (x: number, y: number) => [number, number] | PIXI.IPointData;
      getSnappedPoint?: (point: Point2D, options?: { mode?: number }) => Point2D;
    } | null;
    if (!grid) {
      return point;
    }

    const center = typeof grid.getCenter === "function"
      ? grid.getCenter(point.x, point.y)
      : null;

    if (Array.isArray(center) && center.length >= 2) {
      const [x, y] = center;
      if (Number.isFinite(x) && Number.isFinite(y)) {
        return { x: Math.round(x), y: Math.round(y) };
      }
    }

    if (center && typeof center === "object") {
      const cx = Number((center as { x?: unknown }).x);
      const cy = Number((center as { y?: unknown }).y);
      if (Number.isFinite(cx) && Number.isFinite(cy)) {
        return { x: Math.round(cx), y: Math.round(cy) };
      }
    }

    if (typeof grid.getSnappedPoint === "function") {
      const snapped = grid.getSnappedPoint(point, { mode: 0 });
      if (Number.isFinite(snapped.x) && Number.isFinite(snapped.y)) {
        return { x: Math.round(snapped.x), y: Math.round(snapped.y) };
      }
    }

    return point;
  }

  #syncModeFromSceneControls(): void {
    if (!game.user?.isGM) {
      if (this.#mode !== "off") {
        this.setMode("off");
      }
      return;
    }

    const activeControl = resolveCurrentSceneControlName();
    if (activeControl !== MAP_MARKER_CONTROL_NAME) {
      if (this.#mode !== "off") {
        this.setMode("off");
      }
      return;
    }

    const nextMode = resolveModeFromTool(resolveCurrentSceneToolName());
    const fallbackMode = nextMode === "off" ? "placement" : nextMode;
    if (this.#mode !== fallbackMode) {
      this.setMode(fallbackMode);
    }
  }

  #mountCanvasOverlay(): void {
    if (!canvas.ready || !canvas.interface || this.#overlay) {
      return;
    }

    const overlay = new PIXI.Container();
    overlay.name = "handy-dandy-map-marker-overlay";
    overlay.sortableChildren = true;
    overlay.zIndex = 30;

    const markerSurface = new PIXI.Container();
    markerSurface.name = "handy-dandy-map-marker-surface";
    markerSurface.sortableChildren = true;
    markerSurface.zIndex = 10;

    const selectionGraphics = new PIXI.Graphics();
    selectionGraphics.name = "handy-dandy-map-marker-selection-box";
    selectionGraphics.zIndex = 20;
    selectionGraphics.visible = false;

    overlay.addChild(markerSurface);
    overlay.addChild(selectionGraphics);
    canvas.interface.addChild(overlay);

    this.#overlay = overlay;
    this.#markerSurface = markerSurface;
    this.#selectionGraphics = selectionGraphics;
    this.#attachStageListeners();
  }

  #attachStageListeners(): void {
    const stage = canvas.stage;
    if (!stage) {
      return;
    }

    if (!this.#stageMouseDownListener) {
      this.#stageMouseDownListener = (event: PIXI.FederatedPointerEvent): void => {
        this.#handleStageMouseDown(event);
      };
      stage.on("mousedown", this.#stageMouseDownListener);
    }

    if (!this.#stageMouseMoveListener) {
      this.#stageMouseMoveListener = (event: PIXI.FederatedPointerEvent): void => {
        this.#handleStageMouseMove(event);
      };
      stage.on("mousemove", this.#stageMouseMoveListener);
    }

    if (!this.#stageMouseUpListener) {
      this.#stageMouseUpListener = (event: PIXI.FederatedPointerEvent): void => {
        void this.#handleStageMouseUp(event);
      };
      stage.on("mouseup", this.#stageMouseUpListener);
    }

    if (!this.#stageRightDownListener) {
      this.#stageRightDownListener = (event: PIXI.FederatedPointerEvent): void => {
        void this.#handleStageRightDown(event);
      };
      stage.on("rightdown", this.#stageRightDownListener);
    }

    if (!this.#windowKeyDownListener) {
      this.#windowKeyDownListener = (event: KeyboardEvent): void => {
        void this.#handleWindowKeyDown(event);
      };
      window.addEventListener("keydown", this.#windowKeyDownListener);
    }
  }

  #detachStageListeners(): void {
    const stage = canvas.stage;
    if (this.#stageMouseDownListener && stage) {
      stage.off("mousedown", this.#stageMouseDownListener);
    }
    if (this.#stageMouseMoveListener && stage) {
      stage.off("mousemove", this.#stageMouseMoveListener);
    }
    if (this.#stageMouseUpListener && stage) {
      stage.off("mouseup", this.#stageMouseUpListener);
    }
    if (this.#stageRightDownListener && stage) {
      stage.off("rightdown", this.#stageRightDownListener);
    }

    this.#stageMouseDownListener = null;
    this.#stageMouseMoveListener = null;
    this.#stageMouseUpListener = null;
    this.#stageRightDownListener = null;

    if (this.#windowKeyDownListener) {
      window.removeEventListener("keydown", this.#windowKeyDownListener);
    }
    this.#windowKeyDownListener = null;
  }

  #teardownCanvasOverlay(): void {
    this.#detachStageListeners();

    if (this.#overlay) {
      this.#overlay.destroy({ children: true });
    }

    this.#overlay = null;
    this.#markerSurface = null;
    this.#selectionGraphics = null;
    this.#hideVisibilityToggleButton();
    this.#lastTapByMarker.clear();
    this.#clearSelection();
    this.#clearDragState();
    this.#pointerDownStart = null;
    this.#pointerDownLatest = null;
    this.#pointerDragged = false;
  }

  #clearContainer(container: PIXI.Container): void {
    const children = container.removeChildren();
    for (const child of children) {
      child.destroy({ children: true });
    }
  }

  #createMarkerDisplay(
    marker: MapMarkerData,
    selected: boolean,
    dragPosition: Point2D | null,
  ): PIXI.Container {
    const container = new PIXI.Container();
    container.name = `handy-dandy-map-marker-${marker.id}`;
    const x = dragPosition?.x ?? marker.x;
    const y = dragPosition?.y ?? marker.y;
    container.position.set(x, y);
    container.zIndex = y;
    container.alpha = marker.hidden && game.user?.isGM ? 0.45 : 1;
    const markerSize = this.#resolveMarkerSize();
    const half = markerSize / 2;
    const cornerRadius = Math.max(5, Math.round(markerSize * 0.11));

    if (selected) {
      const selection = new PIXI.Graphics();
      selection.lineStyle(3, 0x8de9ff, 0.95);
      selection.beginFill(0x8de9ff, 0.08);
      selection.drawRoundedRect(
        -half - 4,
        -half - 4,
        markerSize + 8,
        markerSize + 8,
        cornerRadius + 2,
      );
      selection.endFill();
      container.addChild(selection);
    }

    const fillColor = this.#resolveMarkerFillColor(marker);

    const shadow = new PIXI.Graphics();
    shadow.beginFill(0x000000, 0.33);
    shadow.drawRoundedRect(
      -half + 1.5,
      -half + 2,
      markerSize,
      markerSize,
      cornerRadius,
    );
    shadow.endFill();
    container.addChild(shadow);

    const chip = new PIXI.Graphics();
    chip.lineStyle(2, 0x151515, 0.9);
    chip.beginFill(fillColor, 1);
    chip.drawRoundedRect(-half, -half, markerSize, markerSize, cornerRadius);
    chip.endFill();
    container.addChild(chip);

    const label = new PIXI.Text(this.#resolveMarkerLabel(marker), {
      fontFamily: "Signika",
      fontSize: Math.max(14, Math.round(markerSize * (marker.displayMode === "icon" ? 0.55 : 0.5))),
      fill: 0xffffff,
      fontWeight: "700",
      stroke: 0x151515,
      strokeThickness: 4,
      align: "center",
    });
    label.anchor.set(0.5);
    label.resolution = 2;
    container.addChild(label);

    if (marker.kind === "map-note") {
      const badgeWidth = Math.max(30, Math.round(markerSize * 0.45));
      const badgeHeight = Math.max(11, Math.round(markerSize * 0.19));
      const badgeX = half - badgeWidth - 4;
      const badgeY = half - badgeHeight - 4;
      const tag = new PIXI.Graphics();
      tag.beginFill(0x151515, 0.95);
      tag.drawRoundedRect(badgeX, badgeY, badgeWidth, badgeHeight, 3);
      tag.endFill();
      container.addChild(tag);

      const tagText = new PIXI.Text("NOTE", {
        fontFamily: "Signika",
        fontSize: Math.max(8, Math.round(markerSize * 0.15)),
        fill: 0xf5f5f5,
        fontWeight: "700",
        letterSpacing: 0.6,
      });
      tagText.anchor.set(0.5);
      tagText.position.set(badgeX + badgeWidth / 2, badgeY + badgeHeight / 2);
      container.addChild(tagText);
    }

    return container;
  }

  #resolveMarkerLabel(marker: MapMarkerData): string {
    if (marker.displayMode === "icon") {
      return marker.iconSymbol || "*";
    }

    const label = marker.numberLabel.trim();
    return label || "1";
  }

  #resolveMarkerFillColor(marker: MapMarkerData): number {
    if (marker.hidden) {
      return 0x7f8a96;
    }

    return marker.kind === "map-note" ? 0x3477db : 0xd17825;
  }

  #handleStageMouseDown(event: CanvasPointerEvent): void {
    if (!game.user?.isGM) {
      return;
    }

    if (typeof event.button === "number" && event.button !== 0) {
      return;
    }

    const point = this.#resolveEventPosition(event);
    if (!point) {
      return;
    }

    this.#pointerDownStart = point;
    this.#pointerDownLatest = point;
    this.#pointerDragged = false;
    this.#clearSelectionBox();
    this.#hideVisibilityToggleButton();

    if (this.#mode !== "select") {
      this.#clearDragState();
      return;
    }

    const scene = canvas.scene;
    if (!scene) {
      return;
    }

    const markers = getSceneMapMarkers(scene);
    const clickedMarker = this.#findMarkerAtPoint(markers, point);
    if (!clickedMarker) {
      this.#clearDragState();
      if (!event.shiftKey) {
        this.#clearSelection();
        this.renderMarkers();
      }
      return;
    }

    if (event.shiftKey) {
      this.#setMarkerSelection(clickedMarker.id, true);
      this.#clearDragState();
      this.#pointerDownStart = null;
      this.#pointerDownLatest = null;
      this.renderMarkers();
      event.stopPropagation?.();
      return;
    }

    if (!this.#selectedMarkerIds.has(clickedMarker.id)) {
      this.#selectedMarkerIds.clear();
      this.#selectedMarkerIds.add(clickedMarker.id);
    }

    const positions = new Map<string, Point2D>();
    for (const marker of markers) {
      if (!this.#selectedMarkerIds.has(marker.id)) {
        continue;
      }
      positions.set(marker.id, { x: marker.x, y: marker.y });
    }

    this.#dragState = {
      start: point,
      positions,
      offset: { x: 0, y: 0 },
      moved: false,
    };
    this.renderMarkers();
    event.stopPropagation?.();
  }

  #handleStageMouseMove(event: CanvasPointerEvent): void {
    const start = this.#pointerDownStart;
    if (!start) {
      return;
    }

    const current = this.#resolveEventPosition(event);
    if (!current) {
      return;
    }

    this.#pointerDownLatest = current;

    if (this.#mode !== "select") {
      return;
    }

    const dragState = this.#dragState;
    if (dragState) {
      const dx = current.x - dragState.start.x;
      const dy = current.y - dragState.start.y;
      if (!dragState.moved && Math.abs(dx) < 4 && Math.abs(dy) < 4) {
        return;
      }

      dragState.moved = true;
      dragState.offset = { x: dx, y: dy };
      this.#setDragPreviewPositions(dragState);
      event.stopPropagation?.();
      return;
    }

    if (!this.#pointerDragged) {
      const dx = Math.abs(current.x - start.x);
      const dy = Math.abs(current.y - start.y);
      if (dx < 8 && dy < 8) {
        return;
      }
      this.#pointerDragged = true;
    }

    this.#drawSelectionBox(start, current);
    event.stopPropagation?.();
  }

  async #handleStageMouseUp(event: CanvasPointerEvent): Promise<void> {
    if (!game.user?.isGM) {
      return;
    }

    if (typeof event.button === "number" && event.button !== 0) {
      return;
    }

    const start = this.#pointerDownStart;
    const end = this.#resolveEventPosition(event) ?? this.#pointerDownLatest;
    const dragged = this.#pointerDragged;
    const dragState = this.#dragState;

    this.#pointerDownStart = null;
    this.#pointerDownLatest = null;
    this.#pointerDragged = false;

    if (!start || !end) {
      this.#clearSelectionBox();
      return;
    }

    if (dragState?.moved) {
      await this.#commitDragMove(dragState);
      this.#clearSelectionBox();
      this.#clearDragState();
      this.renderMarkers();
      event.stopPropagation?.();
      return;
    }

    if (dragged && this.#mode === "select") {
      const scene = canvas.scene;
      if (!scene) {
        this.#clearSelectionBox();
        return;
      }

      this.#selectMarkersInBox(getSceneMapMarkers(scene), start, end, Boolean(event.shiftKey));
      this.#clearSelectionBox();
      this.renderMarkers();
      event.stopPropagation?.();
      return;
    }

    this.#clearSelectionBox();
    this.#clearDragState();
    await this.#handleStageClick(end, Boolean(event.shiftKey), event);
  }

  async #handleStageRightDown(event: CanvasPointerEvent): Promise<void> {
    if (!game.user?.isGM || this.#mode !== "select") {
      this.#hideVisibilityToggleButton();
      return;
    }

    event.preventDefault?.();
    event.stopPropagation?.();
    const nativeEvent = event.nativeEvent as {
      preventDefault?: () => void;
      stopPropagation?: () => void;
    } | null;
    nativeEvent?.preventDefault?.();
    nativeEvent?.stopPropagation?.();

    const point = this.#resolveEventPosition(event);
    const scene = canvas.scene;
    if (!point || !scene) {
      this.#hideVisibilityToggleButton();
      return;
    }

    const markers = getSceneMapMarkers(scene);
    const clickedMarker = this.#findMarkerAtPoint(markers, point);
    if (!clickedMarker) {
      this.#hideVisibilityToggleButton();
      return;
    }

    if (!this.#selectedMarkerIds.has(clickedMarker.id)) {
      this.#selectedMarkerIds.clear();
      this.#selectedMarkerIds.add(clickedMarker.id);
      this.renderMarkers();
    }

    this.#showVisibilityToggleButton(clickedMarker.id, event.nativeEvent);
  }

  #showVisibilityToggleButton(markerId: string, nativeEvent?: unknown): void {
    const button = this.#ensureVisibilityToggleButton();
    if (!button) {
      return;
    }

    const targetIds = this.#resolveVisibilityTargetIds(markerId);
    if (!targetIds.length) {
      this.#hideVisibilityToggleButton();
      return;
    }

    this.#visibilityToggleTargetMarkerId = markerId;
    const { nextHidden } = this.#resolveVisibilityToggleState(markerId);
    button.title = nextHidden ? "Hide from players" : "Unhide from players";
    button.ariaLabel = button.title;
    button.classList.toggle("active", !nextHidden);

    const fallbackPosition = this.#resolveScreenPositionForMarker(markerId);
    const pointerPosition = this.#resolveScreenPositionFromNativeEvent(nativeEvent);
    const left = pointerPosition?.x ?? fallbackPosition.x;
    const top = pointerPosition?.y ?? fallbackPosition.y;
    button.style.left = `${Math.round(left + 16)}px`;
    button.style.top = `${Math.round(top - 16)}px`;
    button.style.display = "inline-flex";
  }

  #hideVisibilityToggleButton(): void {
    this.#visibilityToggleTargetMarkerId = null;
    if (this.#visibilityToggleButton) {
      this.#visibilityToggleButton.style.display = "none";
    }
  }

  #ensureVisibilityToggleButton(): HTMLButtonElement | null {
    if (this.#visibilityToggleButton?.isConnected) {
      return this.#visibilityToggleButton;
    }

    const root = document.body;
    if (!root) {
      return null;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = `control-icon ${MAP_MARKER_VISIBILITY_BUTTON_CLASS}`;
    button.innerHTML = "<i class=\"fas fa-user-secret\"></i>";
    button.style.position = "fixed";
    button.style.zIndex = "120";
    button.style.width = "34px";
    button.style.height = "34px";
    button.style.display = "none";
    button.style.alignItems = "center";
    button.style.justifyContent = "center";
    button.style.border = "1px solid rgba(255, 255, 255, 0.32)";
    button.style.background = "rgba(0, 0, 0, 0.72)";
    button.style.color = "#f5f5f5";
    button.style.borderRadius = "4px";
    button.style.cursor = "pointer";

    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    button.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void this.#toggleVisibilityFromHud();
    });

    root.appendChild(button);
    this.#visibilityToggleButton = button;
    return button;
  }

  #resolveVisibilityTargetIds(markerId: string): string[] {
    if (this.#selectedMarkerIds.size && this.#selectedMarkerIds.has(markerId)) {
      return Array.from(this.#selectedMarkerIds);
    }

    return [markerId];
  }

  #resolveVisibilityToggleState(markerId: string): { targetIds: string[]; nextHidden: boolean } {
    const scene = canvas.scene;
    if (!scene) {
      return { targetIds: [], nextHidden: true };
    }

    const targetIds = this.#resolveVisibilityTargetIds(markerId);
    if (!targetIds.length) {
      return { targetIds, nextHidden: true };
    }

    const selectedIds = new Set(targetIds);
    const markers = getSceneMapMarkers(scene).filter((entry) => selectedIds.has(entry.id));
    const allHidden = markers.length > 0 && markers.every((entry) => entry.hidden);
    return {
      targetIds,
      nextHidden: !allHidden,
    };
  }

  #resolveScreenPositionForMarker(markerId: string): Point2D {
    const scene = canvas.scene;
    const stage = canvas.stage;
    if (!scene || !stage) {
      return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    }

    const marker = getSceneMapMarkers(scene).find((entry) => entry.id === markerId);
    if (!marker) {
      return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    }

    const worldPoint = new PIXI.Point(marker.x, marker.y);
    const screenPoint = stage.toGlobal(worldPoint);
    return {
      x: Number.isFinite(screenPoint.x) ? screenPoint.x : window.innerWidth / 2,
      y: Number.isFinite(screenPoint.y) ? screenPoint.y : window.innerHeight / 2,
    };
  }

  #resolveScreenPositionFromNativeEvent(nativeEvent: unknown): Point2D | null {
    if (!nativeEvent || typeof nativeEvent !== "object") {
      return null;
    }

    const x = Number((nativeEvent as { clientX?: unknown }).clientX);
    const y = Number((nativeEvent as { clientY?: unknown }).clientY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }

    return { x, y };
  }

  async #toggleVisibilityFromHud(): Promise<void> {
    const scene = canvas.scene;
    const targetMarkerId = this.#visibilityToggleTargetMarkerId;
    if (!scene || !targetMarkerId) {
      this.#hideVisibilityToggleButton();
      return;
    }

    const { targetIds, nextHidden } = this.#resolveVisibilityToggleState(targetMarkerId);
    if (!targetIds.length) {
      this.#hideVisibilityToggleButton();
      return;
    }

    const selectedIds = new Set(targetIds);
    const nextMarkers = getSceneMapMarkers(scene).map((marker) => {
      if (!selectedIds.has(marker.id)) {
        return marker;
      }

      if (marker.hidden === nextHidden) {
        return marker;
      }

      return {
        ...marker,
        hidden: nextHidden,
        updatedAt: Date.now(),
      };
    });

    await setSceneMapMarkers(scene, nextMarkers);
    this.renderMarkers();
    this.#showVisibilityToggleButton(targetMarkerId);

    const count = targetIds.length;
    const verb = nextHidden ? "Hid" : "Unhid";
    ui.notifications?.info(
      `${CONSTANTS.MODULE_NAME} | ${verb} ${count} map marker${count === 1 ? "" : "s"} from players.`,
    );
  }

  async #handleStageClick(point: Point2D, additiveSelection: boolean, event: CanvasPointerEvent): Promise<void> {
    const scene = canvas.scene;
    if (!scene) {
      return;
    }

    const markers = getSceneMapMarkers(scene);
    const clickedMarker = this.#findMarkerAtPoint(markers, point);
    if (clickedMarker) {
      if (this.#mode === "select") {
        this.#setMarkerSelection(clickedMarker.id, additiveSelection);
      }
      this.#handleMarkerTap(clickedMarker.id);
      this.renderMarkers();
      event.stopPropagation?.();
      return;
    }

    if (this.#mode === "placement") {
      const snappedPoint = this.#snapToGrid(point);
      const marker = createDefaultMapMarker({
        x: snappedPoint.x,
        y: snappedPoint.y,
        existing: markers,
        defaults: getUserMapMarkerDefaults(game.user),
      });

      await addSceneMapMarker(scene, marker);
      this.renderMarkers();
      event.stopPropagation?.();
      return;
    }

    if (this.#mode === "select" && this.#selectedMarkerIds.size && !additiveSelection) {
      this.#clearSelection();
      this.renderMarkers();
    }
  }

  #setMarkerSelection(markerId: string, additive: boolean): void {
    if (additive) {
      if (this.#selectedMarkerIds.has(markerId)) {
        this.#selectedMarkerIds.delete(markerId);
      } else {
        this.#selectedMarkerIds.add(markerId);
      }
      return;
    }

    this.#selectedMarkerIds.clear();
    this.#selectedMarkerIds.add(markerId);
  }

  #selectMarkersInBox(
    markers: readonly MapMarkerData[],
    a: Point2D,
    b: Point2D,
    additive: boolean,
  ): void {
    const left = Math.min(a.x, b.x);
    const right = Math.max(a.x, b.x);
    const top = Math.min(a.y, b.y);
    const bottom = Math.max(a.y, b.y);

    if (!additive) {
      this.#selectedMarkerIds.clear();
    }

    for (const marker of markers) {
      if (marker.x < left || marker.x > right || marker.y < top || marker.y > bottom) {
        continue;
      }
      this.#selectedMarkerIds.add(marker.id);
    }
  }

  #clearSelection(): void {
    this.#selectedMarkerIds.clear();
  }

  #clearDragState(): void {
    this.#dragState = null;
    this.#dragPreviewPositions = null;
  }

  #setDragPreviewPositions(dragState: MapMarkerDragState): void {
    const preview = new Map<string, Point2D>();
    for (const [markerId, position] of dragState.positions) {
      preview.set(markerId, {
        x: Math.round(position.x + dragState.offset.x),
        y: Math.round(position.y + dragState.offset.y),
      });
    }

    this.#dragPreviewPositions = preview;
    this.renderMarkers();
  }

  async #commitDragMove(dragState: MapMarkerDragState): Promise<void> {
    const scene = canvas.scene;
    if (!scene || !dragState.moved) {
      return;
    }

    const updatedPositions = new Map<string, Point2D>();
    for (const [markerId, position] of dragState.positions) {
      updatedPositions.set(markerId, {
        x: Math.round(position.x + dragState.offset.x),
        y: Math.round(position.y + dragState.offset.y),
      });
    }

    if (!updatedPositions.size) {
      return;
    }

    await setSceneMapMarkers(
      scene,
      getSceneMapMarkers(scene).map((marker) => {
        const moved = updatedPositions.get(marker.id);
        if (!moved) {
          return marker;
        }

        if (moved.x === marker.x && moved.y === marker.y) {
          return marker;
        }

        return {
          ...marker,
          x: moved.x,
          y: moved.y,
          updatedAt: Date.now(),
        };
      }),
    );
  }

  #pruneSelection(markers: readonly MapMarkerData[]): void {
    if (!this.#selectedMarkerIds.size) {
      return;
    }

    const existingIds = new Set(markers.map((marker) => marker.id));
    for (const markerId of Array.from(this.#selectedMarkerIds)) {
      if (!existingIds.has(markerId)) {
        this.#selectedMarkerIds.delete(markerId);
      }
    }
  }

  #drawSelectionBox(start: Point2D, end: Point2D): void {
    const graphics = this.#selectionGraphics;
    if (!graphics) {
      return;
    }

    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const width = Math.abs(end.x - start.x);
    const height = Math.abs(end.y - start.y);

    graphics.clear();
    graphics.lineStyle(2, 0x8de9ff, 0.95);
    graphics.beginFill(0x8de9ff, 0.16);
    graphics.drawRect(x, y, width, height);
    graphics.endFill();
    graphics.visible = true;
  }

  #clearSelectionBox(): void {
    const graphics = this.#selectionGraphics;
    if (!graphics) {
      return;
    }
    graphics.clear();
    graphics.visible = false;
  }

  #findMarkerAtPoint(
    markers: readonly MapMarkerData[],
    point: { x: number; y: number },
  ): MapMarkerData | null {
    const half = this.#resolveMarkerSize() / 2;
    let found: MapMarkerData | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const marker of markers) {
      const dx = marker.x - point.x;
      const dy = marker.y - point.y;
      if (Math.abs(dx) > half || Math.abs(dy) > half) {
        continue;
      }

      const distance = dx * dx + dy * dy;
      if (distance >= bestDistance) {
        continue;
      }

      found = marker;
      bestDistance = distance;
    }

    return found;
  }

  #resolveEventPosition(event: CanvasPointerEvent): { x: number; y: number } | null {
    const stage = canvas.stage;
    if (!stage) {
      return null;
    }

    const viaEvent =
      typeof event.getLocalPosition === "function" ? event.getLocalPosition(stage) : null;
    const viaData =
      typeof event.data?.getLocalPosition === "function" ? event.data.getLocalPosition(stage) : null;

    const point = viaEvent ?? viaData;
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      return null;
    }

    return {
      x: Math.round(point.x),
      y: Math.round(point.y),
    };
  }

  #handleMarkerTap(markerId: string): void {
    if (!game.user?.isGM) {
      return;
    }

    const now = Date.now();
    const lastTap = this.#lastTapByMarker.get(markerId) ?? 0;
    this.#lastTapByMarker.set(markerId, now);
    if (now - lastTap > 350) {
      return;
    }

    this.#lastTapByMarker.delete(markerId);
    this.#hideVisibilityToggleButton();
    void this.#openMarkerDialog(markerId);
  }

  async #handleWindowKeyDown(event: KeyboardEvent): Promise<void> {
    if (!game.user?.isGM || this.#mode !== "select" || !this.#selectedMarkerIds.size) {
      return;
    }

    if (event.key !== "Delete" && event.key !== "Backspace") {
      return;
    }

    if (this.#isTypingTarget(event.target)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    await this.#deleteSelectedMarkers();
  }

  #isTypingTarget(target: EventTarget | null | undefined): boolean {
    if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement)) {
      return false;
    }

    if (target.isContentEditable) {
      return true;
    }

    const tagName = target.tagName;
    return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT";
  }

  async #deleteSelectedMarkers(): Promise<void> {
    const scene = canvas.scene;
    if (!scene) {
      return;
    }

    const selectedIds = new Set(this.#selectedMarkerIds);
    if (!selectedIds.size) {
      return;
    }

    const markers = getSceneMapMarkers(scene);
    const next = markers.filter((marker) => !selectedIds.has(marker.id));
    const removedCount = markers.length - next.length;
    if (removedCount <= 0) {
      this.#clearSelection();
      this.renderMarkers();
      return;
    }

    await setSceneMapMarkers(scene, next);
    this.#clearSelection();
    this.#hideVisibilityToggleButton();
    this.renderMarkers();
    ui.notifications?.info(
      `${CONSTANTS.MODULE_NAME} | Deleted ${removedCount} map marker${removedCount === 1 ? "" : "s"}.`,
    );
  }

  async #openMarkerDialog(markerId: string): Promise<void> {
    const scene = canvas.scene;
    if (!scene || !game.user?.isGM) {
      return;
    }

    const marker = getSceneMapMarkers(scene).find((entry) => entry.id === markerId);
    if (!marker) {
      return;
    }

    const result = await promptMapMarkerDialog(marker);
    if (result.action === "save" && result.marker) {
      const nextMarker = result.marker;
      await updateSceneMapMarker(scene, markerId, () => nextMarker);
      if (result.defaults) {
        await setUserMapMarkerDefaults(game.user, result.defaults);
      }
      this.renderMarkers();
      return;
    }

    if (result.action === "delete") {
      await removeSceneMapMarker(scene, markerId);
      this.renderMarkers();
    }
  }
}

const mapMarkerController = new MapMarkerController();

export function initialiseMapMarkers(): void {
  mapMarkerController.initialize();
}

export function setMapMarkerMode(mode: MapMarkerToolMode): void {
  if (!game.user?.isGM && mode !== "off") {
    ui.notifications?.warn(`${CONSTANTS.MODULE_NAME} | Only a GM can use map marker tools.`);
    return;
  }

  mapMarkerController.setMode(mode);
}

export function setMapMarkerPlacementActive(active: boolean): void {
  setMapMarkerMode(active ? "placement" : "off");
}

export function refreshMapMarkers(): void {
  mapMarkerController.renderMarkers();
}

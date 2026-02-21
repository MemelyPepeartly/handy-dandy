import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createDefaultMapMarker,
  normalizeMapMarkerDefaults,
  normalizeMapMarkerList,
  resolveNextMarkerNumber,
} from "../src/scripts/map-markers/model";

test("normalizeMapMarkerDefaults returns safe fallback values", () => {
  assert.deepEqual(normalizeMapMarkerDefaults(undefined), {
    prompt: "",
    areaTheme: "",
    tone: "neutral",
    boxTextLength: "medium",
  });
  assert.deepEqual(
    normalizeMapMarkerDefaults({
      prompt: "Room intro",
      areaTheme: "Mossy crypt",
      tone: "grim",
      boxTextLength: "short",
    }),
    {
      prompt: "Room intro",
      areaTheme: "Mossy crypt",
      tone: "grim",
      boxTextLength: "short",
    },
  );
});

test("resolveNextMarkerNumber returns one higher than the max numeric label", () => {
  const next = resolveNextMarkerNumber([
    {
      id: "a",
      x: 0,
      y: 0,
      kind: "specific-room",
      title: "",
      prompt: "",
      areaTheme: "",
      sensoryDetails: "",
      notableFeatures: "",
      occupants: "",
      hazards: "",
      gmNotes: "",
      tone: "neutral",
      boxTextLength: "medium",
      includeGmNotes: false,
      boxText: "",
      hidden: false,
      displayMode: "number",
      numberLabel: "1",
      iconSymbol: "*",
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: "b",
      x: 10,
      y: 10,
      kind: "map-note",
      title: "",
      prompt: "",
      areaTheme: "",
      sensoryDetails: "",
      notableFeatures: "",
      occupants: "",
      hazards: "",
      gmNotes: "",
      tone: "neutral",
      boxTextLength: "medium",
      includeGmNotes: false,
      boxText: "",
      hidden: false,
      displayMode: "icon",
      numberLabel: "8",
      iconSymbol: "!",
      createdAt: 1,
      updatedAt: 1,
    },
  ]);

  assert.equal(next, 9);
});

test("normalizeMapMarkerList filters invalid entries and deduplicates by id", () => {
  const markers = normalizeMapMarkerList([
    {
      id: "one",
      x: 1,
      y: 2,
      kind: "specific-room",
      title: "Entry",
      numberLabel: "1",
      displayMode: "number",
      tone: "mysterious",
      boxTextLength: "long",
    },
    { id: "one", x: 99, y: 99, kind: "map-note", numberLabel: "2", displayMode: "icon" },
    { id: "bad", x: "oops", y: 2 },
    null,
  ]);

  assert.equal(markers.length, 1);
  assert.equal(markers[0]?.id, "one");
  assert.equal(markers[0]?.x, 1);
  assert.equal(markers[0]?.tone, "mysterious");
  assert.equal(markers[0]?.boxTextLength, "long");
});

test("createDefaultMapMarker uses defaults and increments numbering", () => {
  const previousFoundry = (globalThis as { foundry?: unknown }).foundry;
  (globalThis as { foundry?: unknown }).foundry = {
    utils: {
      randomID: (): string => "marker-123",
    },
  };

  try {
    const marker = createDefaultMapMarker({
      x: 120,
      y: 240,
      defaults: {
        prompt: "Base prompt",
        areaTheme: "Dark vault",
        tone: "ominous",
        boxTextLength: "short",
      },
      existing: [
        {
          id: "one",
          x: 0,
          y: 0,
          kind: "specific-room",
          title: "",
          prompt: "",
          areaTheme: "",
          sensoryDetails: "",
          notableFeatures: "",
          occupants: "",
          hazards: "",
          gmNotes: "",
          tone: "neutral",
          boxTextLength: "medium",
          includeGmNotes: false,
          boxText: "",
          hidden: false,
          displayMode: "number",
          numberLabel: "4",
          iconSymbol: "*",
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });

    assert.equal(marker.id, "marker-123");
    assert.equal(marker.numberLabel, "5");
    assert.equal(marker.prompt, "Base prompt");
    assert.equal(marker.areaTheme, "Dark vault");
    assert.equal(marker.kind, "specific-room");
    assert.equal(marker.displayMode, "number");
    assert.equal(marker.tone, "ominous");
    assert.equal(marker.boxTextLength, "short");
  } finally {
    (globalThis as { foundry?: unknown }).foundry = previousFoundry;
  }
});

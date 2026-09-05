import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateOtsuThreshold,
  hasDarkBackground,
} from "../src/ocr/binarization.ts";
import {
  shouldResetConsensusForMotion,
  updateConsecutiveHistory,
} from "../src/ocr/consensus.ts";
import { mapGuideRectToSourceCrop } from "../src/ocr/crop.ts";
import { extractNumber } from "../src/ocr/digits.ts";

test("joins Western, Persian, and Arabic digits split across OCR lines", () => {
  assert.equal(extractNumber("۱۲\n۳ ٤-5", 5), "12345");
});

test("detects a dark background even when Otsu selects zero", () => {
  const histogram = new Uint32Array(256);
  histogram[0] = 9_000;
  histogram[255] = 1_000;
  const threshold = calculateOtsuThreshold(histogram, 10_000);

  assert.equal(threshold, 0);
  assert.equal(hasDarkBackground(0, threshold), true);
  assert.equal(hasDarkBackground(255, threshold), false);
});

test("maps a landscape guide to the matching source pixels", () => {
  assert.deepEqual(
    mapGuideRectToSourceCrop(
      1920,
      1080,
      { left: 0, top: 0, width: 640, height: 360 },
      { left: 44.8, top: 118.8, width: 550.4, height: 122.4 },
    ),
    { x: 134, y: 356, width: 1652, height: 368 },
  );
});

test("accounts for object-fit cropping on a portrait camera", () => {
  assert.deepEqual(
    mapGuideRectToSourceCrop(
      1080,
      1920,
      { left: 0, top: 0, width: 390, height: 292.5 },
      { left: 27.3, top: 64.35, width: 335.4, height: 163.8 },
    ),
    { x: 76, y: 733, width: 928, height: 454 },
  );
});

test("requires matching consecutive results and resets after a mismatch", () => {
  assert.deepEqual(updateConsecutiveHistory([], "123", 2), ["123"]);
  assert.deepEqual(updateConsecutiveHistory(["123"], "123", 2), [
    "123",
    "123",
  ]);
  assert.deepEqual(updateConsecutiveHistory(["123", "123"], "128", 2), [
    "128",
  ]);
});

test("does not treat the first motion baseline as real movement", () => {
  assert.equal(shouldResetConsensusForMotion(Infinity, 24), false);
  assert.equal(shouldResetConsensusForMotion(44, 24), true);
  assert.equal(shouldResetConsensusForMotion(20, 24), false);
});

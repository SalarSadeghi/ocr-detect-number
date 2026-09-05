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
import { evaluateAutomaticDetection } from "../src/ocr/detectionPolicy.ts";
import { findForegroundBounds } from "../src/ocr/imageProcessing.ts";
import {
  selectBestRecognitionCandidate,
  usesSingleCharacterMode,
} from "../src/ocr/recognition.ts";

test("accepts only Western digits and joins OCR lines", () => {
  assert.equal(extractNumber("۱۲۳ ٤٥\n12-3", 3), "123");
});

test("locates a small number inside a much larger OCR crop", () => {
  const grayscale = new Uint8Array(20 * 10).fill(255);
  for (let y = 3; y <= 7; y += 1) {
    for (let x = 8; x <= 11; x += 1) grayscale[y * 20 + x] = 0;
  }

  assert.deepEqual(
    findForegroundBounds(
      grayscale,
      20,
      { x: 0, y: 0, width: 20, height: 10 },
      127,
      false,
    ),
    { x: 8, y: 3, width: 4, height: 5 },
  );
});

test("never accepts repeated low-confidence OCR output", () => {
  const first = evaluateAutomaticDetection({
    value: "128",
    confidence: 62,
    sharpness: 40,
    expectedLength: 3,
    history: [],
  });
  const second = evaluateAutomaticDetection({
    value: "128",
    confidence: 62,
    sharpness: 40,
    expectedLength: 3,
    history: ["128"],
  });

  assert.equal(first.accepted, false);
  assert.deepEqual(first.history, []);
  assert.equal(second.accepted, false);
  assert.deepEqual(second.history, []);
});

test("accepts two matching high-confidence reads", () => {
  const first = evaluateAutomaticDetection({
    value: "123",
    confidence: 92,
    sharpness: 40,
    expectedLength: 3,
    history: [],
  });
  const second = evaluateAutomaticDetection({
    value: "123",
    confidence: 91,
    sharpness: 40,
    expectedLength: 3,
    history: first.history,
  });

  assert.equal(first.accepted, false);
  assert.equal(second.accepted, true);
});

test("uses single-character segmentation only for one expected digit", () => {
  assert.equal(usesSingleCharacterMode(1), true);
  assert.equal(usesSingleCharacterMode(2), false);
  assert.equal(usesSingleCharacterMode(null), false);
});

test("prefers a complete focused/raw read over a destructive binary read", () => {
  const result = selectBestRecognitionCandidate(
    [
      { value: "0123456789", confidence: 85, variant: "raw" },
      { value: "0123486789", confidence: 90, variant: "binary" },
    ],
    10,
  );

  assert.equal(result?.value, "0123456789");
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

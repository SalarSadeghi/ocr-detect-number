import { PSM, type Worker } from "tesseract.js";
import {
  HIGH_CONFIDENCE_THRESHOLD,
  RAW_EARLY_ACCEPT_THRESHOLD,
} from "./config.ts";
import { extractNumber } from "./digits.ts";
import {
  analyzeCanvasForOcr,
  binarizeCanvasForOcr,
  createFocusedCanvasForOcr,
  type CropRegion,
} from "./imageProcessing.ts";

export type RecognitionVariant = "raw" | "focused" | "binary";

export type RecognitionCandidate = {
  value: string;
  confidence: number;
  variant: RecognitionVariant;
};

type CanvasRecognition = {
  candidate: RecognitionCandidate | null;
  sharpness: number;
};

export function usesSingleCharacterMode(expectedLength: number | null) {
  return expectedLength === 1;
}

function lengthMatches(
  candidate: RecognitionCandidate,
  expectedLength: number | null,
) {
  return !expectedLength || candidate.value.length === expectedLength;
}

function candidateScore(
  candidate: RecognitionCandidate,
  expectedLength: number | null,
) {
  const variantBonus =
    candidate.variant === "raw" ? 8 : candidate.variant === "focused" ? 4 : 0;
  const lengthBonus = lengthMatches(candidate, expectedLength) ? 1_000 : 0;
  return lengthBonus + candidate.confidence + variantBonus;
}

export function selectBestRecognitionCandidate(
  candidates: RecognitionCandidate[],
  expectedLength: number | null,
) {
  return candidates.reduce<RecognitionCandidate | null>((best, candidate) => {
    if (!best) return candidate;
    return candidateScore(candidate, expectedLength) >
      candidateScore(best, expectedLength)
      ? candidate
      : best;
  }, null);
}

function isReliable(
  candidate: RecognitionCandidate | null,
  expectedLength: number | null,
  minimumConfidence: number,
) {
  return Boolean(
    candidate &&
      lengthMatches(candidate, expectedLength) &&
      candidate.confidence >= minimumConfidence,
  );
}

async function recognizeCandidate(
  worker: Worker,
  canvas: HTMLCanvasElement,
  expectedLength: number | null,
  variant: RecognitionVariant,
) {
  const result = await worker.recognize(canvas);
  const value = extractNumber(result.data.text, expectedLength);
  if (!value) return null;
  return {
    value,
    confidence: Number.isFinite(result.data.confidence)
      ? result.data.confidence
      : 0,
    variant,
  } satisfies RecognitionCandidate;
}

export async function recognizeNumberFromCanvas(
  worker: Worker,
  canvas: HTMLCanvasElement,
  content: CropRegion,
  expectedLength: number | null,
): Promise<CanvasRecognition> {
  const analysis = analyzeCanvasForOcr(canvas, content);
  await worker.setParameters({
    tessedit_pageseg_mode: usesSingleCharacterMode(expectedLength)
      ? PSM.SINGLE_CHAR
      : PSM.SINGLE_LINE,
  });

  const candidates: RecognitionCandidate[] = [];
  const raw = await recognizeCandidate(worker, canvas, expectedLength, "raw");
  if (raw) candidates.push(raw);
  if (isReliable(raw, expectedLength, RAW_EARLY_ACCEPT_THRESHOLD)) {
    return { candidate: raw, sharpness: analysis.sharpness };
  }

  const focused = createFocusedCanvasForOcr(canvas, analysis);
  if (focused) {
    const focusedCandidate = await recognizeCandidate(
      worker,
      focused.canvas,
      expectedLength,
      "focused",
    );
    if (focusedCandidate) candidates.push(focusedCandidate);
    if (
      isReliable(
        focusedCandidate,
        expectedLength,
        HIGH_CONFIDENCE_THRESHOLD + 5,
      )
    ) {
      return { candidate: focusedCandidate, sharpness: analysis.sharpness };
    }
  }

  const binaryCanvas = focused?.canvas ?? canvas;
  const binaryContent = focused?.content ?? content;
  const binaryAnalysis = focused
    ? analyzeCanvasForOcr(binaryCanvas, binaryContent)
    : analysis;
  binarizeCanvasForOcr(binaryCanvas, binaryAnalysis);
  const binary = await recognizeCandidate(
    worker,
    binaryCanvas,
    expectedLength,
    "binary",
  );
  if (binary) candidates.push(binary);

  return {
    candidate: selectBestRecognitionCandidate(candidates, expectedLength),
    sharpness: analysis.sharpness,
  };
}

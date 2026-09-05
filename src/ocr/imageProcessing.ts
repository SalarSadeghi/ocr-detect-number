import {
  MAX_FOCUSED_OCR_SCALE,
  MAX_OCR_SCALE,
  MAX_OCR_DIMENSION,
  MIN_OCR_WIDTH,
  MOTION_HEIGHT,
  MOTION_WIDTH,
  TARGET_DIGIT_HEIGHT,
} from "./config.ts";
import { calculateOtsuThreshold, hasDarkBackground } from "./binarization.ts";

export type CropRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type OcrImageAnalysis = {
  image: ImageData;
  grayscale: Uint8Array;
  threshold: number;
  darkBackground: boolean;
  sharpness: number;
  foregroundBounds: CropRegion | null;
  content: CropRegion;
};

export function drawSourceForOcr(
  canvas: HTMLCanvasElement,
  source: CanvasImageSource,
  crop: CropRegion,
) {
  const scale = Math.min(
    MAX_OCR_SCALE,
    MAX_OCR_DIMENSION / crop.width,
    MAX_OCR_DIMENSION / crop.height,
    Math.max(1, MIN_OCR_WIDTH / crop.width),
  );
  const padding = 24;
  const contentWidth = Math.max(1, Math.round(crop.width * scale));
  const contentHeight = Math.max(1, Math.round(crop.height * scale));

  canvas.width = contentWidth + padding * 2;
  canvas.height = contentHeight + padding * 2;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("امکان پردازش تصویر وجود ندارد.");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(
    source,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    padding,
    padding,
    contentWidth,
    contentHeight,
  );
  return {
    x: padding,
    y: padding,
    width: contentWidth,
    height: contentHeight,
  };
}

export function findForegroundBounds(
  grayscale: Uint8Array,
  canvasWidth: number,
  content: CropRegion,
  threshold: number,
  darkBackground: boolean,
) {
  const startX = Math.max(0, Math.round(content.x));
  const startY = Math.max(0, Math.round(content.y));
  const width = Math.max(1, Math.round(content.width));
  const height = Math.max(1, Math.round(content.height));
  const rowCounts = new Uint32Array(height);
  const columnCounts = new Uint32Array(width);

  for (let localY = 0; localY < height; localY += 1) {
    for (let localX = 0; localX < width; localX += 1) {
      const gray = grayscale[(startY + localY) * canvasWidth + startX + localX];
      const isForeground = darkBackground ? gray > threshold : gray <= threshold;
      if (!isForeground) continue;
      rowCounts[localY] += 1;
      columnCounts[localX] += 1;
    }
  }

  const minimumRowInk = Math.max(2, Math.round(width * 0.004));
  const minimumColumnInk = Math.max(2, Math.round(height * 0.015));
  const firstRow = rowCounts.findIndex((count) => count >= minimumRowInk);
  const firstColumn = columnCounts.findIndex(
    (count) => count >= minimumColumnInk,
  );
  if (firstRow < 0 || firstColumn < 0) return null;

  let lastRow = height - 1;
  while (lastRow > firstRow && rowCounts[lastRow] < minimumRowInk) lastRow -= 1;
  let lastColumn = width - 1;
  while (
    lastColumn > firstColumn &&
    columnCounts[lastColumn] < minimumColumnInk
  )
    lastColumn -= 1;

  const bounds = {
    x: startX + firstColumn,
    y: startY + firstRow,
    width: lastColumn - firstColumn + 1,
    height: lastRow - firstRow + 1,
  };
  return bounds.width >= 3 && bounds.height >= 3 ? bounds : null;
}

export function analyzeCanvasForOcr(
  canvas: HTMLCanvasElement,
  content: CropRegion,
): OcrImageAnalysis {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("امکان پردازش تصویر وجود ندارد.");

  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const grayscale = new Uint8Array(canvas.width * canvas.height);
  const histogram = new Uint32Array(256);
  let edgeBrightness = 0;
  let edgeSamples = 0;
  let gradientTotal = 0;
  let gradientSamples = 0;

  const startX = Math.max(0, Math.round(content.x));
  const startY = Math.max(0, Math.round(content.y));
  const endX = Math.min(canvas.width, Math.round(content.x + content.width));
  const endY = Math.min(canvas.height, Math.round(content.y + content.height));
  const edgeBand = Math.max(
    2,
    Math.min(12, Math.round(Math.min(content.width, content.height) * 0.04)),
  );

  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      const pixel = y * canvas.width + x;
      const offset = pixel * 4;
      const gray = Math.round(
        image.data[offset] * 0.299 +
          image.data[offset + 1] * 0.587 +
          image.data[offset + 2] * 0.114,
      );
      grayscale[pixel] = gray;
      histogram[gray] += 1;

      if (
        x < startX + edgeBand ||
        y < startY + edgeBand ||
        x >= endX - edgeBand ||
        y >= endY - edgeBand
      ) {
        edgeBrightness += gray;
        edgeSamples += 1;
      }
      if (
        x > startX &&
        y > startY &&
        (x - startX) % 3 === 0 &&
        (y - startY) % 3 === 0
      ) {
        const gradient =
          Math.abs(gray - grayscale[pixel - 1]) +
          Math.abs(gray - grayscale[pixel - canvas.width]);
        if (gradient >= 12) {
          gradientTotal += gradient;
          gradientSamples += 1;
        }
      }
    }
  }

  const threshold = calculateOtsuThreshold(
    histogram,
    Math.max(1, (endX - startX) * (endY - startY)),
  );
  const darkBackground = hasDarkBackground(
    edgeBrightness / Math.max(1, edgeSamples),
    threshold,
  );

  return {
    image,
    grayscale,
    threshold,
    darkBackground,
    sharpness: gradientTotal / Math.max(1, gradientSamples),
    foregroundBounds: findForegroundBounds(
      grayscale,
      canvas.width,
      content,
      threshold,
      darkBackground,
    ),
    content,
  };
}

export function binarizeCanvasForOcr(
  canvas: HTMLCanvasElement,
  analysis: OcrImageAnalysis,
) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("امکان پردازش تصویر وجود ندارد.");
  const { content, darkBackground, grayscale, image, threshold } = analysis;
  const startX = Math.max(0, Math.round(content.x));
  const startY = Math.max(0, Math.round(content.y));
  const endX = Math.min(canvas.width, Math.round(content.x + content.width));
  const endY = Math.min(canvas.height, Math.round(content.y + content.height));

  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      const pixel = y * canvas.width + x;
      const offset = pixel * 4;
      const isBackground = darkBackground
        ? grayscale[pixel] <= threshold
        : grayscale[pixel] > threshold;
      const value = isBackground ? 255 : 0;
      image.data[offset] = value;
      image.data[offset + 1] = value;
      image.data[offset + 2] = value;
    }
  }
  context.putImageData(image, 0, 0);
}

export function createFocusedCanvasForOcr(
  source: HTMLCanvasElement,
  analysis: OcrImageAnalysis,
) {
  const bounds = analysis.foregroundBounds;
  if (!bounds) return null;

  const marginX = Math.max(8, Math.round(bounds.height * 0.3));
  const marginY = Math.max(8, Math.round(bounds.height * 0.35));
  const contentRight = analysis.content.x + analysis.content.width;
  const contentBottom = analysis.content.y + analysis.content.height;
  const x = Math.max(analysis.content.x, bounds.x - marginX);
  const y = Math.max(analysis.content.y, bounds.y - marginY);
  const right = Math.min(contentRight, bounds.x + bounds.width + marginX);
  const bottom = Math.min(contentBottom, bounds.y + bounds.height + marginY);
  const crop = {
    x,
    y,
    width: Math.max(1, right - x),
    height: Math.max(1, bottom - y),
  };

  const coversMostOfInput =
    crop.width >= analysis.content.width * 0.9 &&
    crop.height >= analysis.content.height * 0.9;
  const scale = Math.min(
    MAX_FOCUSED_OCR_SCALE,
    MAX_OCR_DIMENSION / crop.width,
    MAX_OCR_DIMENSION / crop.height,
    Math.max(1, TARGET_DIGIT_HEIGHT / bounds.height),
  );
  if (coversMostOfInput && scale <= 1.1) return null;

  const padding = 32;
  const width = Math.max(1, Math.round(crop.width * scale));
  const height = Math.max(1, Math.round(crop.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width + padding * 2;
  canvas.height = height + padding * 2;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("امکان بزرگ‌نمایی عدد وجود ندارد.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    source,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    padding,
    padding,
    width,
    height,
  );

  return {
    canvas,
    content: { x: padding, y: padding, width, height },
  };
}

export function enhanceCanvasForOcr(
  canvas: HTMLCanvasElement,
  content: CropRegion,
) {
  const analysis = analyzeCanvasForOcr(canvas, content);
  binarizeCanvasForOcr(canvas, analysis);

  return {
    threshold: analysis.threshold,
    darkBackground: analysis.darkBackground,
    sharpness: analysis.sharpness,
  };
}

export function calculateMotionScore(
  motionCanvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  crop: CropRegion,
  previousFrame: Uint8Array | null,
) {
  motionCanvas.width = MOTION_WIDTH;
  motionCanvas.height = MOTION_HEIGHT;
  const context = motionCanvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("امکان بررسی پایداری تصویر وجود ندارد.");

  context.drawImage(
    video,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    MOTION_WIDTH,
    MOTION_HEIGHT,
  );
  const pixels = context.getImageData(0, 0, MOTION_WIDTH, MOTION_HEIGHT).data;
  const signature = new Uint8Array(MOTION_WIDTH * MOTION_HEIGHT);
  for (let pixel = 0; pixel < signature.length; pixel += 1) {
    const offset = pixel * 4;
    signature[pixel] = Math.round(
      pixels[offset] * 0.299 +
        pixels[offset + 1] * 0.587 +
        pixels[offset + 2] * 0.114,
    );
  }

  if (!previousFrame) {
    return { score: Number.POSITIVE_INFINITY, signature };
  }

  let brightnessShift = 0;
  for (let pixel = 0; pixel < signature.length; pixel += 1) {
    brightnessShift += signature[pixel] - previousFrame[pixel];
  }
  brightnessShift /= signature.length;

  let difference = 0;
  for (let pixel = 0; pixel < signature.length; pixel += 1) {
    difference += Math.abs(
      signature[pixel] - previousFrame[pixel] - brightnessShift,
    );
  }

  return { score: difference / signature.length, signature };
}

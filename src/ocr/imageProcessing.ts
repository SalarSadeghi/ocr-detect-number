import {
  MAX_OCR_SCALE,
  MAX_OCR_DIMENSION,
  MIN_OCR_WIDTH,
  MOTION_HEIGHT,
  MOTION_WIDTH,
} from "./config";
import { calculateOtsuThreshold, hasDarkBackground } from "./binarization";

export type CropRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
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

export function enhanceCanvasForOcr(
  canvas: HTMLCanvasElement,
  content: CropRegion,
) {
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
        gradientTotal +=
          Math.abs(gray - grayscale[pixel - 1]) +
          Math.abs(gray - grayscale[pixel - canvas.width]);
        gradientSamples += 2;
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

  return {
    threshold,
    darkBackground,
    sharpness: gradientTotal / Math.max(1, gradientSamples),
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

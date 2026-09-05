import type { CropRegion } from "./imageProcessing";

type Rect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function mapGuideRectToSourceCrop(
  sourceWidth: number,
  sourceHeight: number,
  videoRect: Rect,
  guideRect: Rect,
): CropRegion {
  const coverScale = Math.max(
    videoRect.width / sourceWidth,
    videoRect.height / sourceHeight,
  );
  const renderedWidth = sourceWidth * coverScale;
  const renderedHeight = sourceHeight * coverScale;
  const hiddenLeft = (renderedWidth - videoRect.width) / 2;
  const hiddenTop = (renderedHeight - videoRect.height) / 2;

  const left = clamp(
    (guideRect.left - videoRect.left + hiddenLeft) / coverScale,
    0,
    sourceWidth - 1,
  );
  const top = clamp(
    (guideRect.top - videoRect.top + hiddenTop) / coverScale,
    0,
    sourceHeight - 1,
  );
  const right = clamp(
    (guideRect.left - videoRect.left + guideRect.width + hiddenLeft) /
      coverScale,
    left + 1,
    sourceWidth,
  );
  const bottom = clamp(
    (guideRect.top - videoRect.top + guideRect.height + hiddenTop) /
      coverScale,
    top + 1,
    sourceHeight,
  );

  const x = Math.round(left);
  const y = Math.round(top);
  return {
    x,
    y,
    width: Math.max(1, Math.round(right) - x),
    height: Math.max(1, Math.round(bottom) - y),
  };
}

export function getVideoGuideCrop(
  video: HTMLVideoElement,
  guide: HTMLElement | null,
  fallbackWidthRatio: number,
  fallbackHeightRatio: number,
) {
  const videoRect = video.getBoundingClientRect();
  if (videoRect.width <= 0 || videoRect.height <= 0) {
    return {
      x: Math.round((video.videoWidth * (1 - fallbackWidthRatio)) / 2),
      y: Math.round((video.videoHeight * (1 - fallbackHeightRatio)) / 2),
      width: Math.round(video.videoWidth * fallbackWidthRatio),
      height: Math.round(video.videoHeight * fallbackHeightRatio),
    };
  }

  const guideRect = guide?.getBoundingClientRect() ?? {
    left: videoRect.left + (videoRect.width * (1 - fallbackWidthRatio)) / 2,
    top: videoRect.top + (videoRect.height * (1 - fallbackHeightRatio)) / 2,
    width: videoRect.width * fallbackWidthRatio,
    height: videoRect.height * fallbackHeightRatio,
  };

  return mapGuideRectToSourceCrop(
    video.videoWidth,
    video.videoHeight,
    videoRect,
    guideRect,
  );
}

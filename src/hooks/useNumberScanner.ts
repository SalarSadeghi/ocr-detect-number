import { useCallback, useEffect, useRef, useState } from "react";
import { PSM, type Worker } from "tesseract.js";
import type { DetectionSource, ScannerStatus } from "../types";
import {
  DESKTOP_SCAN_HEIGHT_RATIO,
  MAX_IMAGE_FILE_SIZE,
  MOBILE_SCAN_HEIGHT_RATIO,
  MOTION_SAMPLE_DELAY_MS,
  MOTION_THRESHOLD,
  OCR_RETRY_DELAY_MS,
  REQUIRED_STABLE_FRAMES,
  SCAN_WIDTH_RATIO,
  STABILITY_GUIDANCE_DELAY_MS,
} from "../ocr/config";
import { extractNumber, sanitizeNumber } from "../ocr/digits";
import { shouldResetConsensusForMotion } from "../ocr/consensus";
import {
  evaluateAutomaticDetection,
  getReviewMessage,
} from "../ocr/detectionPolicy";
import { loadImageSource } from "../ocr/imageLoader";
import { getVideoGuideCrop } from "../ocr/crop";
import {
  calculateMotionScore,
  drawSourceForOcr,
  enhanceCanvasForOcr,
} from "../ocr/imageProcessing";
import { createDigitWorker, terminateWorker } from "../ocr/worker";

type UseNumberScannerOptions = {
  expectedLength: number | null;
};

function getCameraError(error: unknown) {
  if (!(error instanceof DOMException))
    return "راه‌اندازی دوربین انجام نشد. دوباره تلاش کنید.";
  switch (error.name) {
    case "NotAllowedError":
      return "اجازهٔ دسترسی به دوربین داده نشد. دسترسی دوربین را فعال و دوباره تلاش کنید.";
    case "NotFoundError":
      return "دوربینی روی این دستگاه پیدا نشد.";
    case "NotReadableError":
      return "دوربین در برنامهٔ دیگری در حال استفاده است.";
    default:
      return error.message || "راه‌اندازی دوربین انجام نشد.";
  }
}

export function useNumberScanner({ expectedLength }: UseNumberScannerOptions) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const guideRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const motionCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const workerPromiseRef = useRef<Promise<Worker> | null>(null);
  const timerRef = useRef<number | null>(null);
  const activeRef = useRef(false);
  const readingRef = useRef(false);
  const mountedRef = useRef(true);
  const runIdRef = useRef(0);
  const expectedLengthRef = useRef(expectedLength);
  const previousMotionFrameRef = useRef<Uint8Array | null>(null);
  const stableFrameCountRef = useRef(0);
  const stabilityStartedAtRef = useRef(0);
  const candidateHistoryRef = useRef<string[]>([]);

  const [status, setStatus] = useState<ScannerStatus>("idle");
  const [number, setNumber] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [isReading, setIsReading] = useState(false);
  const [stabilityProgress, setStabilityProgress] = useState(0);

  useEffect(() => {
    expectedLengthRef.current = expectedLength;
    candidateHistoryRef.current = [];
  }, [expectedLength]);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const resetDetectionWindow = useCallback(() => {
    previousMotionFrameRef.current = null;
    stableFrameCountRef.current = 0;
    stabilityStartedAtRef.current = performance.now();
    setStabilityProgress(0);
  }, []);

  const stopCamera = useCallback(() => {
    runIdRef.current += 1;
    activeRef.current = false;
    clearTimer();
    stopStream();
    resetDetectionWindow();
    readingRef.current = false;
    setIsReading(false);
    setStatus("stopped");
  }, [clearTimer, resetDetectionWindow, stopStream]);

  const ensureWorker = useCallback(() => {
    if (workerRef.current) return Promise.resolve(workerRef.current);
    if (workerPromiseRef.current) return workerPromiseRef.current;

    workerPromiseRef.current = createDigitWorker((progress) => {
      if (mountedRef.current) setOcrProgress(progress);
    }).then((worker) => {
      workerRef.current = worker;
      return worker;
    }).catch((workerError) => {
      workerPromiseRef.current = null;
      throw workerError;
    });

    return workerPromiseRef.current;
  }, []);

  const acceptDetection = useCallback(
    (
      value: string,
      confidence: number,
      source: DetectionSource,
      sharpness: number,
    ) => {
      if (source !== "automatic") {
        setNumber(value);
        setNotice(
          getReviewMessage(value, confidence, expectedLengthRef.current),
        );
        return true;
      }

      const decision = evaluateAutomaticDetection({
        value,
        confidence,
        sharpness,
        expectedLength: expectedLengthRef.current,
        history: candidateHistoryRef.current,
      });
      candidateHistoryRef.current = decision.history;
      setNotice(decision.message);
      if (decision.accepted) setNumber(value);
      return decision.accepted;
    },
    [],
  );

  const scanCameraFrame = useCallback(
    async (runId: number, source: "automatic" | "manual") => {
      if (
        !activeRef.current ||
        runId !== runIdRef.current ||
        readingRef.current
      )
        return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const motionCanvas = motionCanvasRef.current;
      const worker = workerRef.current;
      if (
        !video ||
        !canvas ||
        !motionCanvas ||
        !worker ||
        video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
        video.videoWidth <= 0 ||
        video.videoHeight <= 0
      ) {
        timerRef.current = window.setTimeout(
          () => void scanCameraFrame(runId, "automatic"),
          250,
        );
        return;
      }

      const isMobile = window.matchMedia("(max-width: 520px)").matches;
      const heightRatio = isMobile
        ? MOBILE_SCAN_HEIGHT_RATIO
        : DESKTOP_SCAN_HEIGHT_RATIO;
      const crop = getVideoGuideCrop(
        video,
        guideRef.current,
        SCAN_WIDTH_RATIO,
        heightRatio,
      );

      if (source === "automatic") {
        const motion = calculateMotionScore(
          motionCanvas,
          video,
          crop,
          previousMotionFrameRef.current,
        );
        previousMotionFrameRef.current = motion.signature;
        if (shouldResetConsensusForMotion(motion.score, MOTION_THRESHOLD)) {
          candidateHistoryRef.current = [];
        }
        stableFrameCountRef.current =
          motion.score <= MOTION_THRESHOLD
            ? Math.min(stableFrameCountRef.current + 1, REQUIRED_STABLE_FRAMES)
            : Math.max(stableFrameCountRef.current - 1, 0);
        setStabilityProgress(stableFrameCountRef.current);

        const waitedTooLong =
          performance.now() - stabilityStartedAtRef.current >=
          STABILITY_GUIDANCE_DELAY_MS;
        if (stableFrameCountRef.current < REQUIRED_STABLE_FRAMES) {
          if (waitedTooLong) {
            setNotice(
              "حرکت تصویر زیاد است؛ دوربین را ثابت کنید یا از «ثبت تصویر فعلی» استفاده کنید.",
            );
            stabilityStartedAtRef.current = performance.now();
          }
          timerRef.current = window.setTimeout(
            () => void scanCameraFrame(runId, "automatic"),
            MOTION_SAMPLE_DELAY_MS,
          );
          return;
        }
      }

      readingRef.current = true;
      setIsReading(true);
      setOcrProgress(0);
      try {
        const content = drawSourceForOcr(canvas, video, crop);
        const { sharpness } = enhanceCanvasForOcr(canvas, content);
        await worker.setParameters({
          tessedit_pageseg_mode: PSM.SINGLE_LINE,
        });
        const result = await worker.recognize(canvas);
        const detected = extractNumber(
          result.data.text,
          expectedLengthRef.current,
        );

        if (detected && activeRef.current && runId === runIdRef.current) {
          const accepted = acceptDetection(
            detected,
            result.data.confidence,
            source,
            sharpness,
          );
          if (accepted) {
            activeRef.current = false;
            clearTimer();
            stopStream();
            setStatus("stopped");
          }
        } else {
          candidateHistoryRef.current = [];
          setNotice(
            source === "manual"
              ? "عددی در تصویر پیدا نشد؛ نور، فاصله و وضوح تصویر را بررسی کنید."
              : "عددی دیده نشد؛ عدد را کامل داخل کادر قرار دهید و دوربین را ثابت نگه دارید.",
          );
        }
      } catch (scanError) {
        if (activeRef.current && runId === runIdRef.current) {
          candidateHistoryRef.current = [];
          setError(
            scanError instanceof Error
              ? scanError.message
              : "خواندن عدد انجام نشد.",
          );
        }
      } finally {
        if (runId === runIdRef.current) readingRef.current = false;
        if (mountedRef.current && runId === runIdRef.current) {
          setIsReading(false);
        }
      }

      if (activeRef.current && runId === runIdRef.current) {
        resetDetectionWindow();
        timerRef.current = window.setTimeout(
          () => void scanCameraFrame(runId, "automatic"),
          OCR_RETRY_DELAY_MS,
        );
      }
    },
    [acceptDetection, clearTimer, resetDetectionWindow, stopStream],
  );

  const startCamera = useCallback(async () => {
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    activeRef.current = false;
    readingRef.current = false;
    clearTimer();
    stopStream();
    resetDetectionWindow();
    candidateHistoryRef.current = [];
    setError(null);
    setNotice(null);
    setNumber("");
    setStatus("starting");

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("مرورگر شما از دسترسی به دوربین پشتیبانی نمی‌کند.");
      setStatus("error");
      return;
    }

    const pendingStreams: MediaStream[] = [];
    try {
      const [stream] = await Promise.all([
        navigator.mediaDevices
          .getUserMedia({
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            },
            audio: false,
          })
          .then((cameraStream) => {
            pendingStreams.push(cameraStream);
            return cameraStream;
          }),
        ensureWorker(),
      ]);

      if (!mountedRef.current || runId !== runIdRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      if (!videoRef.current) throw new Error("نمایش دوربین در دسترس نیست.");
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      resetDetectionWindow();
      activeRef.current = true;
      setStatus("scanning");
      timerRef.current = window.setTimeout(
        () => void scanCameraFrame(runId, "automatic"),
        MOTION_SAMPLE_DELAY_MS,
      );
    } catch (startError) {
      pendingStreams.forEach((stream) =>
        stream.getTracks().forEach((track) => track.stop()),
      );
      if (!mountedRef.current || runId !== runIdRef.current) return;
      stopStream();
      setError(getCameraError(startError));
      setStatus("error");
    }
  }, [clearTimer, ensureWorker, resetDetectionWindow, scanCameraFrame, stopStream]);

  const captureNow = useCallback(() => {
    if (!activeRef.current || readingRef.current) return;
    clearTimer();
    void scanCameraFrame(runIdRef.current, "manual");
  }, [clearTimer, scanCameraFrame]);

  const importImage = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) {
        setError("فایل انتخاب‌شده تصویر نیست.");
        return;
      }
      if (file.size > MAX_IMAGE_FILE_SIZE) {
        setError("حجم تصویر باید کمتر از ۱۵ مگابایت باشد.");
        return;
      }

      const runId = runIdRef.current + 1;
      runIdRef.current = runId;
      activeRef.current = false;
      readingRef.current = false;
      clearTimer();
      stopStream();
      setStatus("processing-image");
      readingRef.current = true;
      setIsReading(true);
      setOcrProgress(0);
      setError(null);
      setNotice("در حال آماده‌سازی و خواندن تصویر…");

      let cleanup: () => void = () => undefined;
      try {
        const [worker, loaded] = await Promise.all([
          ensureWorker(),
          loadImageSource(file),
        ]);
        cleanup = loaded.cleanup;
        const canvas = canvasRef.current;
        if (!canvas) throw new Error("امکان پردازش تصویر وجود ندارد.");
        const content = drawSourceForOcr(canvas, loaded.source, {
          x: 0,
          y: 0,
          width: loaded.width,
          height: loaded.height,
        });
        const { sharpness } = enhanceCanvasForOcr(canvas, content);
        await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
        const result = await worker.recognize(canvas);
        const detected = extractNumber(
          result.data.text,
          expectedLengthRef.current,
        );
        if (!detected) {
          setError("عددی در تصویر پیدا نشد. تصویر واضح‌تر یا برش نزدیک‌تری انتخاب کنید.");
          setNotice(null);
        } else {
          acceptDetection(
            detected,
            result.data.confidence,
            "image",
            sharpness,
          );
        }
        setStatus("stopped");
      } catch (imageError) {
        setError(
          imageError instanceof Error
            ? imageError.message
            : "خواندن تصویر انجام نشد.",
        );
        setNotice(null);
        setStatus("error");
      } finally {
        cleanup();
        if (runId === runIdRef.current) readingRef.current = false;
        if (mountedRef.current && runId === runIdRef.current)
          setIsReading(false);
      }
    },
    [acceptDetection, clearTimer, ensureWorker, stopStream],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      runIdRef.current += 1;
      activeRef.current = false;
      readingRef.current = false;
      clearTimer();
      stopStream();
      const workerPromise = workerPromiseRef.current;
      workerPromiseRef.current = null;
      workerRef.current = null;
      void terminateWorker(workerPromise);
    };
  }, [clearTimer, stopStream]);

  return {
    videoRef,
    guideRef,
    canvasRef,
    motionCanvasRef,
    status,
    number,
    setNumber: (value: string) => setNumber(sanitizeNumber(value)),
    error,
    notice,
    setError,
    setNotice,
    ocrProgress,
    isReading,
    stabilityProgress,
    isActive: status === "scanning",
    isStarting: status === "starting",
    isProcessingImage: status === "processing-image",
    startCamera,
    stopCamera,
    captureNow,
    importImage,
  };
}

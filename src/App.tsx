import { useCallback, useEffect, useRef, useState } from "react";
import { createWorker, OEM, PSM, type Worker } from "tesseract.js";

const MOTION_SAMPLE_DELAY_MS = 450; //Delay between movement checks. 450 ms keeps CPU usage low while responding reasonably quickly.
const OCR_RECHECK_DELAY_MS = 800; //Delay before confirming the OCR result again. It prevents continuous expensive OCR processing.
const REQUIRED_STABLE_FRAMES = 2; //Number of stable comparisons needed before OCR. 2 generally requires about one second of stability.
const REQUIRED_OCR_MATCHES = 2; //Number of identical OCR results required. 2 reduces accidental detections.
const MOTION_THRESHOLD = 20; //Maximum motion score considered stable. 20 tolerates normal hand shake, autofocus and minor camera noise.
const MOTION_WIDTH = 32; //Resolution used only for motion detection. 32×12 averages sensor noise and is inexpensive. Actual OCR still uses the larger image.
const MOTION_HEIGHT = 12; //Resolution used only for motion detection. 32×12 averages sensor noise and is inexpensive. Actual OCR still uses the larger image.
const STORAGE_KEY = "camera-number-ocr:saved-numbers";

type AppStatus = "idle" | "starting" | "scanning" | "stopped" | "error";
type SavedNumber = { id: string; value: string; savedAt: string };

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

function extractNumber(text: string) {
  const matches = text.match(/\d+/g);
  if (!matches) return null;
  return matches.reduce((longest, current) =>
    current.length > longest.length ? current : longest,
  );
}

function normalizeNumber(value: string) {
  const persianDigits = "۰۱۲۳۴۵۶۷۸۹";
  const arabicDigits = "٠١٢٣٤٥٦٧٨٩";
  return value
    .replace(/[۰-۹]/g, (digit) => String(persianDigits.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String(arabicDigits.indexOf(digit)))
    .replace(/\D/g, "");
}

function loadSavedNumbers(): SavedNumber[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is SavedNumber =>
        typeof item === "object" &&
        item !== null &&
        typeof item.id === "string" &&
        typeof item.value === "string" &&
        typeof item.savedAt === "string",
    );
  } catch {
    return [];
  }
}

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const motionCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const workerPromiseRef = useRef<Promise<Worker> | null>(null);
  const timerRef = useRef<number | null>(null);
  const activeRef = useRef(false);
  const mountedRef = useRef(true);
  const runIdRef = useRef(0);
  const previousMotionFrameRef = useRef<Uint8Array | null>(null);
  const stableFrameCountRef = useRef(0);
  const ocrCandidateRef = useRef<{ value: string; matches: number } | null>(
    null,
  );

  const [status, setStatus] = useState<AppStatus>("idle");
  const [number, setNumber] = useState("");
  const [savedNumbers, setSavedNumbers] =
    useState<SavedNumber[]>(loadSavedNumbers);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [isReading, setIsReading] = useState(false);
  const [stabilityProgress, setStabilityProgress] = useState(0);

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

  const stopCamera = useCallback(() => {
    runIdRef.current += 1;
    activeRef.current = false;
    clearTimer();
    stopStream();
    setIsReading(false);
    setStabilityProgress(0);
    previousMotionFrameRef.current = null;
    stableFrameCountRef.current = 0;
    ocrCandidateRef.current = null;
    setStatus("stopped");
  }, [clearTimer, stopStream]);

  const ensureWorker = useCallback(() => {
    if (workerRef.current) return Promise.resolve(workerRef.current);
    if (workerPromiseRef.current) return workerPromiseRef.current;
    workerPromiseRef.current = (async () => {
      const worker = await createWorker("eng", OEM.LSTM_ONLY, {
        logger: (message) => {
          if (mountedRef.current && message.status === "recognizing text") {
            setOcrProgress(Math.round(message.progress * 100));
          }
        },
      });
      try {
        await worker.setParameters({
          tessedit_char_whitelist: "0123456789",
          tessedit_pageseg_mode: PSM.SINGLE_LINE,
          preserve_interword_spaces: "0",
        });
        workerRef.current = worker;
        return worker;
      } catch (workerError) {
        await worker.terminate();
        throw workerError;
      }
    })().catch((workerError) => {
      workerPromiseRef.current = null;
      throw workerError;
    });
    return workerPromiseRef.current;
  }, []);

  const scanFrame = useCallback(
    async (runId: number) => {
      if (!activeRef.current || runId !== runIdRef.current) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const worker = workerRef.current;
      if (
        !video ||
        !canvas ||
        !worker ||
        video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
      ) {
        timerRef.current = window.setTimeout(() => void scanFrame(runId), 250);
        return;
      }

      try {
        const sourceWidth = video.videoWidth;
        const sourceHeight = Math.round(video.videoHeight * 0.34);
        const sourceY = Math.round((video.videoHeight - sourceHeight) / 2);

        const motionCanvas = motionCanvasRef.current;
        const motionContext = motionCanvas?.getContext("2d", {
          willReadFrequently: true,
        });
        if (!motionCanvas || !motionContext)
          throw new Error("امکان بررسی پایداری تصویر وجود ندارد.");
        motionCanvas.width = MOTION_WIDTH;
        motionCanvas.height = MOTION_HEIGHT;
        motionContext.drawImage(
          video,
          0,
          sourceY,
          sourceWidth,
          sourceHeight,
          0,
          0,
          MOTION_WIDTH,
          MOTION_HEIGHT,
        );

        const motionPixels = motionContext.getImageData(
          0,
          0,
          MOTION_WIDTH,
          MOTION_HEIGHT,
        ).data;
        const signature = new Uint8Array(MOTION_WIDTH * MOTION_HEIGHT);
        for (let pixel = 0; pixel < signature.length; pixel += 1) {
          const offset = pixel * 4;
          signature[pixel] = Math.round(
            motionPixels[offset] * 0.299 +
              motionPixels[offset + 1] * 0.587 +
              motionPixels[offset + 2] * 0.114,
          );
        }

        const previousSignature = previousMotionFrameRef.current;
        let motionScore = Number.POSITIVE_INFINITY;
        if (previousSignature) {
          let brightnessShift = 0;
          for (let pixel = 0; pixel < signature.length; pixel += 1) {
            brightnessShift += signature[pixel] - previousSignature[pixel];
          }
          brightnessShift /= signature.length;

          let difference = 0;
          for (let pixel = 0; pixel < signature.length; pixel += 1) {
            difference += Math.abs(
              signature[pixel] - previousSignature[pixel] - brightnessShift,
            );
          }
          motionScore = difference / signature.length;
        }
        previousMotionFrameRef.current = signature;

        if (motionScore <= MOTION_THRESHOLD) {
          stableFrameCountRef.current = Math.min(
            stableFrameCountRef.current + 1,
            REQUIRED_STABLE_FRAMES,
          );
        } else {
          // Small handheld movement only reduces progress; a large move starts over.
          stableFrameCountRef.current = Math.max(
            stableFrameCountRef.current - 1,
            0,
          );
          if (motionScore > MOTION_THRESHOLD * 1.8)
            ocrCandidateRef.current = null;
        }
        setStabilityProgress(stableFrameCountRef.current);

        if (stableFrameCountRef.current < REQUIRED_STABLE_FRAMES) {
          setIsReading(false);
          if (activeRef.current && runId === runIdRef.current) {
            timerRef.current = window.setTimeout(
              () => void scanFrame(runId),
              MOTION_SAMPLE_DELAY_MS,
            );
          }
          return;
        }

        setIsReading(true);
        setOcrProgress(0);
        const targetWidth = Math.min(sourceWidth, 1_280);
        const targetHeight = Math.max(
          1,
          Math.round((sourceHeight / sourceWidth) * targetWidth),
        );
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("امکان پردازش تصویر وجود ندارد.");
        context.drawImage(
          video,
          0,
          sourceY,
          sourceWidth,
          sourceHeight,
          0,
          0,
          targetWidth,
          targetHeight,
        );

        const pixels = context.getImageData(0, 0, targetWidth, targetHeight);
        for (let index = 0; index < pixels.data.length; index += 4) {
          const gray =
            pixels.data[index] * 0.299 +
            pixels.data[index + 1] * 0.587 +
            pixels.data[index + 2] * 0.114;
          const value = gray > 145 ? 255 : 0;
          pixels.data[index] = value;
          pixels.data[index + 1] = value;
          pixels.data[index + 2] = value;
        }
        context.putImageData(pixels, 0, 0);

        const result = await worker.recognize(canvas);
        const detected = extractNumber(result.data.text);
        if (detected && activeRef.current && runId === runIdRef.current) {
          const previousCandidate = ocrCandidateRef.current;
          const matches =
            previousCandidate?.value === detected
              ? previousCandidate.matches + 1
              : 1;
          ocrCandidateRef.current = { value: detected, matches };

          if (matches >= REQUIRED_OCR_MATCHES) {
            setNumber(detected);
            setNotice(
              "عدد با دو بار خواندن یکسان تأیید شد؛ در صورت نیاز آن را ویرایش و سپس ذخیره کنید.",
            );
            activeRef.current = false;
            stopStream();
            setStatus("stopped");
          } else {
            setNotice(
              "تصویر ثابت است؛ عدد برای اطمینان یک بار دیگر بررسی می‌شود.",
            );
          }
        } else {
          ocrCandidateRef.current = null;
        }
      } catch (scanError) {
        if (activeRef.current && runId === runIdRef.current) {
          setError(
            scanError instanceof Error
              ? scanError.message
              : "خواندن عدد انجام نشد.",
          );
        }
      } finally {
        if (mountedRef.current && runId === runIdRef.current)
          setIsReading(false);
      }
      if (activeRef.current && runId === runIdRef.current) {
        timerRef.current = window.setTimeout(
          () => void scanFrame(runId),
          OCR_RECHECK_DELAY_MS,
        );
      }
    },
    [stopStream],
  );

  const startCamera = useCallback(async () => {
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    activeRef.current = false;
    clearTimer();
    stopStream();
    setError(null);
    setNotice(null);
    setNumber("");
    setStabilityProgress(0);
    previousMotionFrameRef.current = null;
    stableFrameCountRef.current = 0;
    ocrCandidateRef.current = null;
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
              width: { ideal: 1280 },
              height: { ideal: 720 },
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
      activeRef.current = true;
      setStatus("scanning");
      void scanFrame(runId);
    } catch (startError) {
      pendingStreams.forEach((stream) =>
        stream.getTracks().forEach((track) => track.stop()),
      );
      if (!mountedRef.current || runId !== runIdRef.current) return;
      stopStream();
      setError(getCameraError(startError));
      setStatus("error");
    }
  }, [clearTimer, ensureWorker, scanFrame, stopStream]);

  const saveNumber = useCallback(() => {
    const normalized = normalizeNumber(number);
    if (!normalized) {
      setError("ابتدا یک عدد وارد یا با دوربین اسکن کنید.");
      return;
    }
    const newItem: SavedNumber = {
      id: makeId(),
      value: normalized,
      savedAt: new Date().toISOString(),
    };
    setSavedNumbers((current) => [newItem, ...current]);
    setNumber("");
    setError(null);
    setNotice("عدد با موفقیت ذخیره شد.");
  }, [number]);

  const deleteNumber = useCallback((id: string) => {
    setSavedNumbers((current) => current.filter((item) => item.id !== id));
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(savedNumbers));
    } catch {
      setError("مرورگر اجازهٔ ذخیره‌سازی اطلاعات را نمی‌دهد.");
    }
  }, [savedNumbers]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      runIdRef.current += 1;
      activeRef.current = false;
      clearTimer();
      stopStream();
      const workerPromise = workerPromiseRef.current;
      workerPromiseRef.current = null;
      workerRef.current = null;
      if (workerPromise)
        void workerPromise
          .then((worker) => worker.terminate())
          .catch(() => undefined);
    };
  }, [clearTimer, stopStream]);

  const isActive = status === "scanning";
  const isStarting = status === "starting";

  return (
    <main className="app-shell">
      <section className="scanner-card">
        <header>
          <p className="eyebrow">تشخیص عدد </p>
          {/* <h1>اسکنر عدد</h1> */}
          <p className="intro">
            کادر را روی یک عدد واضح بگیرید و دوربین را ثابت نگه دارید.
          </p>
        </header>

        <div className={`camera-frame ${isActive ? "is-active" : ""}`}>
          <video
            ref={videoRef}
            muted
            playsInline
            aria-label="نمای زندهٔ دوربین"
          />
          {!isActive && (
            <div className="camera-placeholder">
              <span className="camera-icon" aria-hidden="true">
                ◎
              </span>
              <span>
                {isStarting ? "در حال راه‌اندازی دوربین…" : "دوربین خاموش است"}
              </span>
            </div>
          )}
          {isActive && (
            <div className="scan-guide" aria-hidden="true">
              <span>عدد را داخل این کادر قرار دهید</span>
            </div>
          )}
        </div>

        <canvas ref={canvasRef} className="hidden-canvas" aria-hidden="true" />
        <canvas
          ref={motionCanvasRef}
          className="hidden-canvas"
          aria-hidden="true"
        />

        <div className="result-panel" aria-live="polite">
          <label className="result-label" htmlFor="detected-number">
            عدد تشخیص‌داده‌شده
          </label>
          <input
            id="detected-number"
            className={number ? "has-result" : ""}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            dir="ltr"
            readOnly={isActive || isStarting}
            value={number}
            placeholder="—"
            onChange={(event) => {
              setNumber(normalizeNumber(event.target.value));
              setNotice(null);
            }}
            aria-describedby="edit-hint"
          />
          <span id="edit-hint" className="scan-status">
            {isReading
              ? `در حال خواندن تصویر${ocrProgress ? ` · ٪${ocrProgress}` : "…"}`
              : isActive
                ? stabilityProgress < REQUIRED_STABLE_FRAMES
                  ? `دوربین را ثابت نگه دارید · ${stabilityProgress.toLocaleString("fa-IR")} از ${REQUIRED_STABLE_FRAMES.toLocaleString("fa-IR")}`
                  : "تصویر ثابت است؛ در حال بررسی عدد"
                : number
                  ? "عدد را بررسی یا ویرایش کنید"
                  : "برای شروع، دوربین را روشن کنید"}
          </span>
        </div>

        {error && (
          <div className="error-message" role="alert">
            {error}
          </div>
        )}
        {notice && (
          <div className="notice-message" role="status">
            {notice}
          </div>
        )}

        <div className="controls camera-controls">
          <button
            className="primary"
            type="button"
            onClick={() => void startCamera()}
            disabled={isStarting || isActive}
          >
            {isStarting
              ? "در حال آماده‌سازی…"
              : number
                ? "اسکن دوباره"
                : "روشن کردن دوربین"}
          </button>
          <button
            className="secondary"
            type="button"
            onClick={stopCamera}
            disabled={!isActive && !isStarting}
          >
            توقف دوربین
          </button>
        </div>
        <button
          className="save-button"
          type="button"
          onClick={saveNumber}
          disabled={!number || isActive}
        >
          ذخیرهٔ عدد
        </button>

        <section className="saved-section" aria-labelledby="saved-title">
          <div className="section-heading">
            <h2 id="saved-title">اعداد ذخیره‌شده</h2>
            <span>{savedNumbers.length.toLocaleString("fa-IR")} مورد</span>
          </div>
          {savedNumbers.length === 0 ? (
            <p className="empty-state">هنوز عددی ذخیره نشده است.</p>
          ) : (
            <ul className="saved-list">
              {savedNumbers.map((item) => (
                <li key={item.id}>
                  <div>
                    <strong dir="ltr">{item.value}</strong>
                    <time dateTime={item.savedAt}>
                      {new Intl.DateTimeFormat("fa-IR", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(item.savedAt))}
                    </time>
                  </div>
                  <button
                    type="button"
                    onClick={() => deleteNumber(item.id)}
                    aria-label={`حذف عدد ${item.value}`}
                  >
                    حذف
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="privacy-note">
          تصاویر فقط داخل مرورگر پردازش می‌شوند و جایی ارسال نمی‌شوند.
        </p>
      </section>
    </main>
  );
}

import { useRef, type ChangeEvent, type RefObject } from "react";
import type { ScannerStatus } from "../types";
import { REQUIRED_STABLE_FRAMES } from "../ocr/config";

type ScannerPanelProps = {
  videoRef: RefObject<HTMLVideoElement | null>;
  guideRef: RefObject<HTMLDivElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  motionCanvasRef: RefObject<HTMLCanvasElement | null>;
  status: ScannerStatus;
  isActive: boolean;
  isStarting: boolean;
  isProcessingImage: boolean;
  isReading: boolean;
  stabilityProgress: number;
  ocrProgress: number;
  expectedLength: number | null;
  onExpectedLengthChange: (value: number | null) => void;
  onStart: () => void;
  onStop: () => void;
  onCapture: () => void;
  onImport: (file: File) => void;
};

export function ScannerPanel({
  videoRef,
  guideRef,
  canvasRef,
  motionCanvasRef,
  status,
  isActive,
  isStarting,
  isProcessingImage,
  isReading,
  stabilityProgress,
  ocrProgress,
  expectedLength,
  onExpectedLengthChange,
  onStart,
  onStop,
  onCapture,
  onImport,
}: ScannerPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const busy = isStarting || isProcessingImage || isReading;

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) onImport(file);
    event.target.value = "";
  };

  const statusText = (() => {
    if (isProcessingImage)
      return `در حال خواندن تصویر${ocrProgress ? ` · ٪${ocrProgress}` : "…"}`;
    if (isReading)
      return `در حال خواندن دوربین${ocrProgress ? ` · ٪${ocrProgress}` : "…"}`;
    if (isStarting) return "در حال بارگیری مدل‌های تشخیص عدد…";
    if (isActive)
      return `دوربین را ثابت نگه دارید · ${stabilityProgress.toLocaleString("fa-IR")} از ${REQUIRED_STABLE_FRAMES.toLocaleString("fa-IR")}`;
    if (status === "stopped") return "برای اسکن بعدی دوربین را روشن یا یک تصویر انتخاب کنید";
    return "دوربین را روشن یا یک تصویر انتخاب کنید";
  })();

  return (
    <>
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
              {isProcessingImage
                ? "در حال پردازش تصویر…"
                : isStarting
                  ? "در حال راه‌اندازی دوربین…"
                  : "دوربین خاموش است"}
            </span>
          </div>
        )}
        {isActive && (
          <div ref={guideRef} className="scan-guide" aria-hidden="true">
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

      <p className="scanner-status" aria-live="polite">
        {statusText}
      </p>

      <div className="settings-row">
        <label htmlFor="expected-length">تعداد رقم مورد انتظار</label>
        <input
          id="expected-length"
          type="number"
          inputMode="numeric"
          min="1"
          max="32"
          value={expectedLength ?? ""}
          placeholder="اختیاری"
          onChange={(event) => {
            const parsed = Number(event.target.value);
            onExpectedLengthChange(
              event.target.value && parsed >= 1 && parsed <= 32 ? parsed : null,
            );
          }}
        />
      </div>

      <div className="controls camera-controls">
        <button
          className="primary"
          type="button"
          onClick={onStart}
          disabled={isStarting || isActive || isProcessingImage}
        >
          {isStarting ? "در حال آماده‌سازی…" : "روشن کردن دوربین"}
        </button>
        <button
          className="secondary"
          type="button"
          onClick={onStop}
          disabled={!isActive && !isStarting}
        >
          توقف دوربین
        </button>
      </div>

      <div className="secondary-actions">
        <button
          className="manual-button"
          type="button"
          onClick={onCapture}
          disabled={!isActive || isReading}
        >
          ثبت تصویر فعلی
        </button>
        <button
          className="import-button"
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
        >
          انتخاب تصویر از دستگاه
        </button>
        <input
          ref={fileInputRef}
          className="visually-hidden"
          type="file"
          accept="image/*"
          onChange={handleFile}
          tabIndex={-1}
        />
      </div>
    </>
  );
}

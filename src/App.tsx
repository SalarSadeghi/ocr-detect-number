import { useState } from "react";
import { NumberEditor } from "./components/NumberEditor";
import { SavedNumbersList } from "./components/SavedNumbersList";
import { ScannerPanel } from "./components/ScannerPanel";
import { useNumberScanner } from "./hooks/useNumberScanner";
import { useSavedNumbers } from "./hooks/useSavedNumbers";

export default function App() {
  const [expectedLength, setExpectedLength] = useState<number | null>(null);
  const scanner = useNumberScanner({ expectedLength });
  const saved = useSavedNumbers();

  const saveDetectedNumber = () => {
    if (!scanner.number) {
      scanner.setError("ابتدا یک عدد وارد یا با دوربین اسکن کنید.");
      return;
    }
    saved.saveNumber(scanner.number);
    scanner.setNumber("");
    scanner.setError(null);
    scanner.setNotice("عدد با موفقیت ذخیره شد.");
  };

  const displayedError = scanner.error ?? saved.storageError;
  const editorDisabled =
    scanner.isActive || scanner.isStarting || scanner.isProcessingImage;

  return (
    <main className="app-shell">
      <section className="scanner-card">
        <header>
          <p className="eyebrow">تشخیص عدد با دوربین و تصویر</p>
          <h1>اسکنر عدد</h1>
          <p className="intro">
            عدد را داخل کادر قرار دهید یا تصویر آن را از دستگاه انتخاب کنید.
          </p>
        </header>

        <ScannerPanel
          videoRef={scanner.videoRef}
          guideRef={scanner.guideRef}
          canvasRef={scanner.canvasRef}
          motionCanvasRef={scanner.motionCanvasRef}
          status={scanner.status}
          isActive={scanner.isActive}
          isStarting={scanner.isStarting}
          isProcessingImage={scanner.isProcessingImage}
          isReading={scanner.isReading}
          stabilityProgress={scanner.stabilityProgress}
          ocrProgress={scanner.ocrProgress}
          expectedLength={expectedLength}
          onExpectedLengthChange={setExpectedLength}
          onStart={() => void scanner.startCamera()}
          onStop={scanner.stopCamera}
          onCapture={scanner.captureNow}
          onImport={(file) => void scanner.importImage(file)}
        />

        <NumberEditor
          value={scanner.number}
          disabled={editorDisabled}
          onChange={(value) => {
            scanner.setNumber(value);
            scanner.setNotice(null);
          }}
          onSave={saveDetectedNumber}
        />

        {displayedError && (
          <div className="error-message" role="alert">
            {displayedError}
          </div>
        )}
        {scanner.notice && (
          <div className="notice-message" role="status">
            {scanner.notice}
          </div>
        )}

        <SavedNumbersList
          numbers={saved.savedNumbers}
          onDelete={saved.deleteNumber}
        />

        <p className="privacy-note">
          تصاویر فقط داخل مرورگر پردازش می‌شوند و جایی ارسال نمی‌شوند.
        </p>
      </section>
    </main>
  );
}

import { createWorker, OEM, type Worker } from "tesseract.js";
import { DIGIT_WHITELIST, OCR_LANGUAGES } from "./config";

export async function createDigitWorker(onProgress: (progress: number) => void) {
  const worker = await createWorker(OCR_LANGUAGES, OEM.LSTM_ONLY, {
    logger: (message) => {
      if (message.status === "recognizing text") {
        onProgress(Math.round(message.progress * 100));
      }
    },
  });

  try {
    await worker.setParameters({
      tessedit_char_whitelist: DIGIT_WHITELIST,
      preserve_interword_spaces: "0",
      user_defined_dpi: "300",
    });
    return worker;
  } catch (error) {
    await worker.terminate();
    throw error;
  }
}

export async function terminateWorker(workerPromise: Promise<Worker> | null) {
  if (!workerPromise) return;
  try {
    const worker = await workerPromise;
    await worker.terminate();
  } catch {
    // Initialization failures are already surfaced to the scanner UI.
  }
}

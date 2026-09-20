import { createWorker, OEM, type Worker } from "tesseract.js";
import { DIGIT_WHITELIST, OCR_LANGUAGE } from "./config";

export async function createDigitWorker(onProgress: (progress: number) => void) {
  const worker = await createWorker(OCR_LANGUAGE, OEM.LSTM_ONLY, {
    workerPath: `${import.meta.env.BASE_URL}ocr/worker.min.js`,
    corePath: `${import.meta.env.BASE_URL}ocr/core`,
    langPath: `${import.meta.env.BASE_URL}ocr/lang`,
    workerBlobURL: false,
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

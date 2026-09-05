# Camera Number OCR

A React + Vite + TypeScript application that reads Western digits (`0-9`) from a device camera or an imported image with Tesseract.js. The Persian, right-to-left interface lets the user review or correct a detected number before saving it locally.

## Run it

```bash
pnpm install
pnpm dev
```

Open the local URL shown by Vite, select **روشن کردن دوربین**, grant camera permission, and place a printed number inside the green guide. Alternatively, select **انتخاب تصویر از دستگاه**. Detection stops automatically when a number is accepted, so it can be edited and saved without a later scan overwriting it.

## Notes

- OCR runs locally in the browser. The first start downloads Tesseract's worker, WebAssembly core, and English recognition data, so it can take a moment.
- Only Western digits (`0123456789`) are accepted by OCR, manual editing, and storage.
- Motion is sampled every 350 ms. Two stable comparisons trigger OCR; moving frames are not sent to automatic recognition. Failed attempts retry after 1.2 seconds, and recursive timeouts prevent overlapping work.
- Automatic OCR is accepted only after two consecutive matching high-confidence reads. Empty, low-confidence, mismatched, or substantially moved frames clear the candidate history; manual capture and imported images are always returned for user review.
- **ثبت تصویر فعلی** bypasses the stability wait and provides a manual fallback.
- **تعداد رقم مورد انتظار** is optional. When set, automatic camera results with a different length are rejected, significantly reducing false positives.
- OCR first reads the original crop so thresholding cannot destroy slightly blurred strokes. When needed, it locates and enlarges the foreground number and then tries an Otsu-binarized fallback. Background polarity is measured from the unpadded image and dark displays are inverted correctly.
- The OCR crop is mapped from the green guide through the preview's `object-fit: cover` transform, so it matches the visible target on portrait and landscape cameras.
- Recognition uses Tesseract's single-character mode when one digit is expected and single-line mode otherwise. Supported cameras are also asked to use continuous autofocus and exposure.
- The Persian UI uses the local IRANSans files from `public/fonts`.
- The same Tesseract worker is reused for every frame and is terminated when the app unmounts.
- Camera tracks are stopped when **Stop camera** is selected or the app unmounts.
- Saved numbers and their timestamps remain in the browser using `localStorage`; each item can be deleted from the list.
- PWA registration and installation are currently disabled. The inactive manifest, service-worker, and icon assets remain in `public` so the feature can be restored later.
- Camera access works on `localhost`. To test from another device, serve the app over HTTPS because browsers require a secure context for camera access.

## Structure

- `src/components`: camera, editor, and saved-number interface components.
- `src/hooks/useNumberScanner.ts`: camera and imported-image workflow orchestration.
- `src/hooks/useSavedNumbers.ts`: local persistence.
- `src/ocr`: language configuration, worker creation, digit normalization, image loading, preprocessing, motion scoring, and detection policy.
- `src/App.tsx`: small composition layer for the application.

## Production build

```bash
pnpm build
pnpm preview
```

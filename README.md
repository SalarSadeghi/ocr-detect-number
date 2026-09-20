# Camera Number OCR

A React + Vite + TypeScript application that reads Western digits (`0-9`) from a device camera or an imported image with Tesseract.js. The Persian, right-to-left interface lets the user review or correct a detected number before saving it locally.

## Run it

```bash
pnpm install
pnpm dev
```

Open the local URL shown by Vite, select **روشن کردن دوربین**, grant camera permission, and place a printed number inside the green guide. Alternatively, select **انتخاب تصویر از دستگاه**. Detection stops automatically when a number is accepted, so it can be edited and saved without a later scan overwriting it.

## Notes

- OCR runs locally in the browser. Worker, WebAssembly engines, and English model are bundled with the application; no CDN or cloud OCR service is used at runtime.
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
- Production builds support installation and offline use. Wait for the Persian “ready for offline use” message before disconnecting. The first visit caches the complete app and OCR assets (approximately 33 MB before HTTP compression).
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

Open the preview at `/ocr-detect-number/`. Offline caching is enabled in the
production build, not the development server. Build preparation copies the
installed OCR worker/core and verifies the bundled English model checksum;
it does not download anything. Dependency installation requires internet unless
the package-manager cache is already populated.

For a hosted installation, use HTTPS, open the app once while connected, and
wait for offline readiness. Afterwards, reopening the same URL, importing
images, camera recognition, and saved numbers work without internet. Browser
storage must remain available: clearing site data or browser eviction removes
the offline installation and can remove saved numbers.

For first launch without internet, distribute `dist` and serve it locally under
`/ocr-detect-number/` using an already-installed local web server. Opening
`index.html` directly as a file is unsupported. `localhost` supports camera
access; a phone accessing another computer's server needs HTTPS.

Updates download completely before installation. When an update is ready,
close all app windows and reopen to switch versions. Caches are scoped to this
app's deployment path; unrelated site caches are left alone.

Optional browser verification: after building, run
`node scripts/test-offline.mjs` with Playwright available (or set
`PLAYWRIGHT_MODULE_PATH` to its installed module). The test uses headless Edge,
stops the local server, reloads offline, and performs the first OCR operation
without any prior OCR model cache. Set `BROWSER_CHANNEL` for another installed
Chromium browser.

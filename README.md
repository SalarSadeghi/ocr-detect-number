# Camera Number OCR

A React + Vite + TypeScript PWA that reads printed numbers from a device camera with Tesseract.js. The Persian, right-to-left interface lets the user review or correct a detected number before saving it locally.

## Run it

```bash
pnpm install
pnpm dev
```

Open the local URL shown by Vite, select **روشن کردن دوربین**, grant camera permission, and place a printed number inside the green guide. Detection stops automatically when a number is found, so it can be edited and saved without a later scan overwriting it.

## Notes

- OCR runs locally in the browser. The first start downloads Tesseract's worker, WebAssembly core, and English recognition data, so it can take a moment.
- Before OCR starts, the app compares small grayscale samples of the target area and requires three stable frames. It then requires two matching OCR results before accepting a number. Recursive timeouts prevent overlapping OCR jobs.
- Detection uses exposure-compensated motion comparison, so autofocus and global brightness changes are not mistaken for camera movement. Its defaults are documented near the top of `src/App.tsx`:
  - `MOTION_SAMPLE_DELAY_MS = 450`: wait between inexpensive motion checks. Lower values react faster but use more CPU.
  - `OCR_RECHECK_DELAY_MS = 800`: wait before confirming an OCR result again. This prevents back-to-back heavy OCR work.
  - `REQUIRED_STABLE_FRAMES = 2`: number of consecutive low-motion comparisons required before OCR starts. The initial frame is the baseline, so this takes roughly 0.9–1.35 seconds.
  - `REQUIRED_OCR_MATCHES = 2`: the same detected value must be read twice before it is accepted.
  - `MOTION_THRESHOLD = 20`: maximum exposure-adjusted average pixel difference considered stable. The value tolerates normal handheld movement while rejecting intentional camera movement.
  - `MOTION_WIDTH = 32` and `MOTION_HEIGHT = 12`: resolution of the motion-only sample. Downsampling to this size averages camera noise and keeps checks inexpensive; OCR still uses the larger image.
- The Persian UI uses the local IRANSans files from `public/fonts`, including offline/PWA sessions after they have been cached.
- The same Tesseract worker is reused for every frame and is terminated when the app unmounts.
- Camera tracks are stopped when **Stop camera** is selected or the app unmounts.
- Saved numbers and their timestamps remain in the browser using `localStorage`; each item can be deleted from the list.
- A web app manifest and service worker make production builds installable and cache the application shell for offline reopening.
- Android/Chromium receives a native in-app installation button when installation criteria are met. iPhone/iPad users see Safari's **Share → Add to Home Screen** instructions. The manifest includes 192 px, 512 px, maskable, and Apple touch icons.
- Camera access works on `localhost`. To test from another device, serve the app over HTTPS because browsers require a secure context for camera access.

## Production build

```bash
pnpm build
pnpm preview
```

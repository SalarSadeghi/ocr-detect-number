# Bundled OCR assets

The worker and core are copied from the installed Tesseract.js dependencies by
`scripts/prepare-ocr.mjs` before development and production builds. No download
is performed by that script. Both SIMD and non-SIMD variants are included.

English LSTM model (checked into this project):
- Source: https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int/eng.traineddata.gz
- SHA-256: 45b4cb346724ac1774f1c36f42f182b887bcdb28ebe63e6fff90ac41f3fcff91
- Upstream: https://github.com/naptha/tessdata
- License: Apache-2.0; see MODEL-LICENSE.

The build checks the model checksum and precaches these files with the app.

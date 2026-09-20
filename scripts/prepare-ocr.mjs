import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const tesseract = dirname(require.resolve('tesseract.js/package.json'));
const core = dirname(createRequire(join(tesseract, 'package.json')).resolve('tesseract.js-core/package.json'));
await mkdir('public/ocr/core', { recursive: true });
const model = await readFile('public/ocr/lang/eng.traineddata.gz');
if (createHash('sha256').update(model).digest('hex') !== '45b4cb346724ac1774f1c36f42f182b887bcdb28ebe63e6fff90ac41f3fcff91') {
  throw new Error('Bundled English OCR model failed its checksum. Restore public/ocr/lang/eng.traineddata.gz.');
}
await copyFile(join(tesseract, 'dist/worker.min.js'), 'public/ocr/worker.min.js');
// Include both SIMD and non-SIMD engines for different devices.
for (const name of ['tesseract-core', 'tesseract-core-simd', 'tesseract-core-lstm', 'tesseract-core-simd-lstm']) {
  for (const extension of ['wasm.js', 'wasm']) {
    await copyFile(join(core, `${name}.${extension}`), `public/ocr/core/${name}.${extension}`);
  }
}
await copyFile(join(tesseract, 'LICENSE.md'), 'public/ocr/TESSERACT-LICENSE.md');
await copyFile(join(core, 'LICENSE'), 'public/ocr/CORE-LICENSE');
console.log('Local OCR assets prepared.');


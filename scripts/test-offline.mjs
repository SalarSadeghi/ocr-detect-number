import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve, extname } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const base = '/ocr-detect-number/';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  if (!path.startsWith(base) || path.includes('..')) { response.writeHead(404).end(); return; }
  const file = path.slice(base.length) || 'index.html';
  try {
    const body = await readFile(resolve('dist', file));
    response.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' });
    response.end(body);
  } catch { response.writeHead(404).end(); }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
  const context = await browser.newContext();
  const external = [];
  context.on('request', (request) => {
    if (/^https?:/.test(request.url()) && !request.url().startsWith(origin + '/')) external.push(request.url());
  });
  const page = await context.newPage();
  await page.goto(origin + base);
  await page.getByText('آمادهٔ استفادهٔ آفلاین؛ می‌توانید اینترنت را قطع کنید.').waitFor({ timeout: 120000 });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
  await context.setOffline(true);
  await page.reload();
  await page.locator('#detected-number').waitFor();
  // No OCR was run online: this verifies worker, core, and model precaching.
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1000; canvas.height = 220;
    const drawing = canvas.getContext('2d');
    drawing.fillStyle = 'white'; drawing.fillRect(0, 0, 1000, 220);
    drawing.fillStyle = 'black'; drawing.font = '100px Arial';
    drawing.fillText('1234567890', 60, 145);
    return canvas.toDataURL().split(',')[1];
  });
  await page.locator('#expected-length').fill('10');
  await page.locator('input[type=file]').setInputFiles({ name: 'offline-number.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await page.waitForFunction(() => document.querySelector('#detected-number').value === '1234567890', { }, { timeout: 120000 });
  assert.deepEqual(external, [], 'Runtime must not request external URLs');
  console.log('PASS: full offline reload and first-use OCR read 1234567890 with the server stopped; no external requests.');
} finally {
  if (browser) await browser.close();
  server.closeAllConnections();
  server.close();
}

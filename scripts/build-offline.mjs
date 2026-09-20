import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

async function listFiles(directory, prefix = '') {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = prefix + entry.name;
    if (entry.isDirectory()) result.push(...await listFiles(`${directory}/${entry.name}`, `${name}/`));
    else if (name !== 'sw.js') result.push(name);
  }
  return result.sort();
}
const files = await listFiles('dist');
const template = await readFile('public/sw.js', 'utf8');
const hash = createHash('sha256').update(template);
for (const file of files) hash.update(file).update(await readFile(`dist/${file}`));
const output = template
  .replace('__BUILD_VERSION__', hash.digest('hex').slice(0, 16))
  .replace('/* __PRECACHE_FILES__ */ []', JSON.stringify(files));
await writeFile('dist/sw.js', output);
console.log(`Offline cache includes all ${files.length} app and OCR files.`);


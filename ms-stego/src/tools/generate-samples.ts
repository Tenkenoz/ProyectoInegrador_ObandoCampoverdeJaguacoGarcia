import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSampleSuite } from './samples/sample-suite.js';

const destination = process.argv[2]
  ? resolve(process.argv[2])
  : fileURLToPath(new URL('../../samples', import.meta.url));
const suite = createSampleSuite();
await mkdir(destination, { recursive: true });
for (const [filename, buffer] of suite.files)
  await writeFile(resolve(destination, filename), buffer);
await writeFile(
  resolve(destination, 'manifest.json'),
  JSON.stringify(suite.manifest, null, 2) + '\n',
);
console.log(`Generated ${suite.files.size} sample files in ${destination}`);
for (const sample of suite.manifest.samples) {
  const detection = sample.detection;
  console.log(
    `${sample.filename}: ${detection ? detection.status + ', p=' + detection.indicators.p_value : 'HTTP ' + sample.expected_http_status}`,
  );
}

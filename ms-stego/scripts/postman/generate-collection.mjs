import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { STATUS_CODES } from 'node:http';
import { createCollection } from './collection.mjs';
import { createEnvironment } from './environments.mjs';

const manifest = JSON.parse(await readFile('samples/manifest.json', 'utf8'));
const evidence = JSON.parse(
  await readFile('docs/evidence/local/report.json', 'utf8'),
);
const collection = createCollection(manifest);
const requests = collection.item.flatMap((item) => item.item);
for (const item of requests) {
  const filename = item.request.body?.formdata?.[0]?.src;
  if (
    !filename ||
    (!item.name.startsWith('T09 ·') &&
      !['samples/corrupt.png', 'samples/false-extension.png'].includes(
        filename,
      ))
  )
    continue;
  const example = evidence.cases.find(
    (entry) => entry.request.sample === filename.replace('samples/', ''),
  );
  if (!example) continue;
  item.response.push({
    name: `Ejemplo local con AUTH de pruebas — HTTP ${example.actual_http_status}`,
    originalRequest: item.request,
    status: STATUS_CODES[example.actual_http_status],
    code: example.actual_http_status,
    _postman_previewlanguage: 'json',
    header: [{ key: 'X-Request-Id', value: example.request_id }],
    cookie: [],
    body: JSON.stringify(example.response, null, 2),
  });
}
await mkdir('postman', { recursive: true });
const files = {
  'stego.postman_collection.json': collection,
  'examples-source.json': {
    tipo: 'evidencia_local_con_auth_de_pruebas',
    generado_en: evidence.completed_at,
    huella_del_codigo: evidence.source.digest,
    casos: evidence.cases.filter((entry) => entry.request.sample),
  },
  'local.postman_environment.json': createEnvironment(
    'STEGO — Desarrollo local',
    'http://127.0.0.1:3002',
  ),
  'integrated.postman_environment.json': createEnvironment(
    'STEGO — Integración del equipo',
    '',
  ),
};
for (const [filename, content] of Object.entries(files))
  await writeFile(
    `postman/${filename}`,
    `${JSON.stringify(content, null, 2)}\n`,
  );
console.log(
  `Generated ${requests.length} requests in ${collection.item.length} folders and two credential-free environments`,
);

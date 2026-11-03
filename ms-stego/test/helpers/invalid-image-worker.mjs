import { parentPort } from 'node:worker_threads';

parentPort.postMessage({
  ok: true,
  image: { format: 'png', width: 1, height: 1, pixels: new Uint8Array(1) },
});

import { parentPort, workerData } from 'node:worker_threads';
import { ImageValidationError } from '../errors/image-validation.error.js';
import type {
  DecoderInput,
  DecoderMessage,
} from '../interfaces/decoder-message.js';
import { decodeImage } from '../utils/decode-image.js';

const input = workerData as DecoderInput;
let response: DecoderMessage;
try {
  response = {
    ok: true,
    image: decodeImage(Buffer.from(input.buffer), input.format, input.limits),
  };
} catch (error) {
  response =
    error instanceof ImageValidationError
      ? { ok: false, status: error.status, message: error.message }
      : { ok: false, status: 400, message: 'The image cannot be decoded' };
}
parentPort?.postMessage(response);

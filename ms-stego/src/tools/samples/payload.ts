import { createHash } from 'node:crypto';
import { deterministicBytes } from './deterministic-bytes.js';

const HEADER_SIZE = 40;

function whiten(bytes: Buffer): Buffer {
  const mask = deterministicBytes('stego-demo-whitening-v1', bytes.length);
  return Buffer.from(bytes.map((value, index) => value ^ mask[index]!));
}

export function embedPayload(pixels: Uint8Array, message: Buffer) {
  const capacity = Math.floor(((pixels.length / 4) * 3) / 8);
  if (
    pixels.length % 4 ||
    capacity < HEADER_SIZE ||
    message.length > capacity - HEADER_SIZE
  ) {
    throw new RangeError('The sample does not have enough payload capacity');
  }
  const packet = deterministicBytes('stego-demo-padding-v1', capacity);
  packet.write('STG1', 0, 'ascii');
  packet.writeUInt32BE(message.length, 4);
  createHash('sha256').update(message).digest().copy(packet, 8);
  message.copy(packet, HEADER_SIZE);
  const payload = whiten(packet);
  const result = Uint8Array.from(pixels);
  for (let bit = 0; bit < payload.length * 8; bit++) {
    const offset = Math.floor(bit / 3) * 4 + (bit % 3);
    result[offset] =
      (result[offset]! & 254) |
      ((payload[Math.floor(bit / 8)]! >>> (7 - (bit % 8))) & 1);
  }
  return { pixels: result, embeddedSamples: payload.length * 8 };
}

export function recoverPayload(pixels: Uint8Array): Buffer {
  const length = Math.floor(((pixels.length / 4) * 3) / 8);
  if (pixels.length % 4 || length < HEADER_SIZE)
    throw new RangeError('The sample payload is incomplete');
  const payload = Buffer.alloc(length);
  for (let bit = 0; bit < length * 8; bit++) {
    const offset = Math.floor(bit / 3) * 4 + (bit % 3);
    const index = Math.floor(bit / 8);
    payload[index] =
      payload[index]! | ((pixels[offset]! & 1) << (7 - (bit % 8)));
  }
  const packet = whiten(payload);
  if (packet.toString('ascii', 0, 4) !== 'STG1')
    throw new Error('The sample payload header is invalid');
  const messageLength = packet.readUInt32BE(4);
  if (messageLength > packet.length - HEADER_SIZE)
    throw new Error('The sample payload length is invalid');
  const message = packet.subarray(HEADER_SIZE, HEADER_SIZE + messageLength);
  if (
    !createHash('sha256')
      .update(message)
      .digest()
      .equals(packet.subarray(8, 40))
  )
    throw new Error('The sample payload checksum is invalid');
  return Buffer.from(message);
}

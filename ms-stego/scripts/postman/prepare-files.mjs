import { mkdir, copyFile, writeFile } from 'node:fs/promises';

const maxBytes = Number(process.argv[2] ?? 5242880);
if (!Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > 20971520)
  throw new Error('The upload limit must be an integer between 1 and 20971520');
await mkdir('postman/files', { recursive: true });
await writeFile('postman/files/oversized.png', Buffer.alloc(maxBytes + 1));
await writeFile('postman/files/empty.png', Buffer.alloc(0));
await copyFile('samples/original.png', 'postman/files/mismatched.bmp');
console.log(
  `Prepared local Postman fixtures with an oversized file of ${maxBytes + 1} bytes`,
);

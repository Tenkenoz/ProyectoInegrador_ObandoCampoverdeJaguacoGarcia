# Image upload validation

`POST /api/v1/steganography/analyze` accepts one image in the multipart field
`file`. A verified access token and a current AUTH decision for
`steganography.analyze` are required. Authentication and authorization complete
before upload interceptors run.

This stage validates the upload and returns `200` with `status: "validated"`.
It does not run an LSB detector, classify the image, create an analysis record,
store a file or put anything in quarantine. Those operations belong to the
subsequent detection and persistence tasks.

## Request

```bash
curl --fail-with-body \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -F "file=@sample.png;type=image/png" \
  http://localhost:3002/api/v1/steganography/analyze
```

Only one `file` part is accepted. Additional files, unexpected field names and
text fields are rejected. The requester identity comes from the verified JWT;
there is no client-supplied owner field.

Swagger at `/docs` documents multipart input, the response and error statuses.
The corresponding OpenAPI JSON is available at `/docs-json`.

## Supported encodings

| Format | Accepted input |
| --- | --- |
| PNG | Non-interlaced, 8-bit RGB or RGBA; color types 2 and 6. |
| BMP | 40-byte BITMAPINFOHEADER, uncompressed BI_RGB, 24 or 32 bits per pixel, no palette, pixel offset 54. |

PNG filenames must end in `.png` and declare `image/png`. BMP filenames must end
in `.bmp` and declare `image/bmp` or `image/x-ms-bmp`. Extensions and media types
are compared case-insensitively. Filenames cannot contain paths or control
characters and must fit in 255 UTF-8 bytes.

Magic bytes must identify the same format as the extension and media type. Other
formats, including JPEG, GIF, SVG and WebP, are rejected even if renamed.

### PNG integrity

The validator checks the PNG signature, IHDR, dimensions, encoding, chunk bounds,
chunk checksums, consecutive IDAT chunks and the final IEND marker. Trailing
bytes, duplicate headers and more than 2048 chunks are rejected. Unknown critical
chunks are unsupported. Animated PNG and transparency-key (`tRNS`) chunks are
unsupported. Palette/grayscale/16-bit/interlaced PNG variants are also unsupported.

Before pixel decoding, inflation is bounded to the exact expected scanline size.
The inflated size and consumed compressed data must match. `pngjs` then performs
pixel decoding with CRC checks enabled. Gamma correction, rescaling and color
conversion are not applied. Fully transparent RGBA pixels retain their RGB sample
values for subsequent LSB processing.

### BMP integrity

The validator checks the signature, header size, positive width, nonzero signed
height, plane count, bit depth, compression, declared file size, pixel offset and
pixel data extent. Reserved fields must be zero. The declared image size must be
zero or match the computed row storage size. Each row includes its required
four-byte alignment padding. Both bottom-up and top-down images are supported.

Pixels are decoded from BGR/BGRX into top-down RGBA. The unused byte of 32-bit
BI_RGB pixels is ignored and output alpha is set to 255. RGB sample values are
preserved. Compressed, palette, bitfield, OS/2, V4/V5 and other BMP encodings are
outside this initial supported subset.

## Configuration and processing limits

| Variable | Default | Accepted range |
| --- | --- | --- |
| `UPLOAD_MAX_FILE_BYTES` | 5242880 (5 MiB) | 1–20971520 |
| `IMAGE_MAX_WIDTH` | 4096 | 1–8192 |
| `IMAGE_MAX_HEIGHT` | 4096 | 1–8192 |
| `IMAGE_MAX_PIXELS` | 4000000 | 1–16000000 |
| `IMAGE_DECODE_TIMEOUT_MS` | 3000 | 100–10000 |
| `UPLOAD_MAX_CONCURRENT` | 2 | 1–4 |

Width, height and total pixels are independent limits. The default permits a
2000×2000 image but rejects a 4096×4096 image because its pixel count is too high.
The exact configured byte limit is accepted; files above it are rejected.

Multipart parsing uses bounded memory storage. Requests with a declared total
length greater than the file limit plus 64 KiB are rejected before parsing.
File-size limits also apply while reading uploads without `Content-Length`.
Multer limits files, fields, parts and field-name lengths.

A capacity limit applies before multipart reception. A separate limit bounds
active decoder workers, including workers still finishing after cancellation.
Capacity exhaustion returns `503`; no unbounded queue is maintained.

Decoding runs in a worker thread with a deadline and JavaScript heap limits
(128 MiB old generation, 16 MiB young generation, 4 MiB stack). Input bytes and
pixel dimensions bound buffer allocations independently of those heap settings.
The worker is terminated and its permit released on success or failure.
The configured decoding deadline covers worker startup and processing; exceeding
it returns `413`.

Deployment ingress should additionally enforce upload connection/request timeouts,
body limits and an overall container memory limit. Worker deadlines govern decoding,
not a client's network transmission time.

## Memory and names

No temporary files or public directories are created. The client filename is
retained only as validated display metadata. The response includes an opaque
UUID-based filename; it is not an existing file path or download URL.

The upload interceptor clears the buffered original file and removes its request
reference when processing succeeds or fails. Decoded pixels are cleared after
validation metadata is produced. Multipart parsing errors also release upload
capacity. Buffers that were never exposed by an aborted parser are left to its
normal memory cleanup; this does not provide a forensic guarantee of memory erasure.

## Response

```json
{
  "status": "validated",
  "upload_id": "<UUID_UPLOAD>",
  "user_id": "<UUID_USER>",
  "filename": "<UUID_UPLOAD>.png",
  "original_filename": "sample.png",
  "sha256": "<SHA256_OF_ORIGINAL_BYTES>",
  "format": "png",
  "size_bytes": 1234,
  "width": 640,
  "height": 480
}
```

The example values are illustrative. `upload_id` is transient and does not identify
a persisted analysis or a resource that can be retrieved later. No detection
metrics or `analysis_id` are returned at this stage.

## Error statuses

| Status | Meaning |
| --- | --- |
| `400` | Missing/empty file, malformed multipart, unexpected parts, contradictory supported metadata, corrupt/truncated image or inconsistent structure. |
| `401` | Missing/invalid token or invalidated session. |
| `403` | AUTH denies the analysis action. |
| `413` | File/request size, dimension, pixel, PNG chunk or decoder time limit exceeded. |
| `415` | Unsupported request content type, extension, MIME, signature or image encoding. |
| `503` | AUTH unavailable, invalid authorization response, upload/worker capacity exhausted or worker infrastructure failure. |

Responses contain English error messages without parser stack traces, local paths,
file contents or service secrets.

## Implementation and verification

The `steganography` module separates configuration, DTOs, controller, orchestration
service, upload interceptor, capacity management, decoder provider, worker and pure
validation/decoding utilities. No detection or persistence logic is implemented in
the controller.

```bash
pnpm lint
pnpm test
pnpm test:e2e
```

Test commands compile first so real worker tests execute the same JavaScript entry
point used in production. When running Vitest directly or in watch mode, rebuild
worker sources after changing them. The HTTP suite exercises the real upload
controller and decoder with an HTTPS AUTH fixture; the team AUTH deployment is
still pending joint integration.

Tests cover valid PNG/BMP pixels, orientation and padding, MIME/signature spoofing,
corruption, checksums, unsupported variants, inflated-output limits, dimensions,
worker deadlines/concurrency, exact file-size boundaries, malformed multipart,
cleanup, repeated requests after errors and denial before upload processing.

## References

- [PNG specification](https://www.w3.org/TR/png/).
- [Microsoft BITMAPINFOHEADER](https://learn.microsoft.com/windows/win32/api/wingdi/ns-wingdi-bitmapinfoheader).
- [pngjs](https://github.com/pngjs/pngjs).
- [NestJS file uploads](https://docs.nestjs.com/techniques/file-upload).

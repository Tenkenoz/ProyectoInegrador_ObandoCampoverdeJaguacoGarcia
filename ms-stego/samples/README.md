# Reproducible LSB samples

Regenerate from `ms-stego/` with `pnpm samples:generate`.

- `original.png` and `original.bmp`: synthetic LSB-biased cover without an embedded message.
- `lsb-payload.png` and `lsb-payload.bmp`: the same cover with a known full-capacity LSB replacement payload.
- `payload.txt`: the exact recoverable message, with its checksum recorded in the manifest.
- `noise-control.png`: generated without embedding; deliberately retained as a known false positive.
- `small.png`: insufficient pixel count.
- `flat-control.png`: insufficient pair diversity.
- `corrupt.png`: truncated PNG, expected HTTP 400.
- `false-extension.png`: valid GIF bytes renamed as PNG, expected HTTP 415.
- `manifest.json`: hashes, configuration, ground truth and measured results.

The main samples are synthetic controls, not a representative benchmark or proof
of detection accuracy. See [LSB technique](../docs/TECNICA_LSB.md) for construction,
parameters, interpretation and limitations.

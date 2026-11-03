# LSB chi-square analysis

## Scope and implementation

STEGO runs the `lsb_chi_square_v1` technique after validating the caller, current
authorization and image integrity. The technique looks for statistical
compatibility with least-significant-bit replacement in RGB samples. It does not
extract arbitrary hidden messages or prove that a suspicious image contains one.

The method is inspired by the pairs-of-values observation in Westfeld and
Pfitzmann's [Attacks on Steganographic Systems](https://www2.htw-dresden.de/~westfeld/publikationen/ihw99.pdf).
This implementation uses a conditional, two-category Pearson statistic for each
pair and combines the statistics across RGB channels. It is not a verbatim
implementation of the original paper's statistic or a validated reproduction of
its experimental detection rates.

Supported inputs are non-interlaced 8-bit RGB/RGBA PNG and uncompressed 24/32-bit
BI_RGB BMP with a 40-byte BITMAPINFOHEADER. See [Upload validation](UPLOADS.md)
for all encoding, integrity and size restrictions.

## Data preparation

Decoders preserve RGB sample values and expose top-down RGBA pixels. No resizing,
gamma correction, denoising or color conversion is performed before analysis.
Alpha is excluded from the histogram and sample count. RGB components in fully
transparent PNG pixels are included; this choice can also flag naturally
unstructured transparent regions.

Each channel has a separate 256-bin histogram. For each channel, the algorithm
examines 128 pairs `(0,1), (2,3), ..., (254,255)` whose values differ only in the
least significant bit.

## Statistic and degrees of freedom

For one pair, let `a` and `b` be the observed counts and `N = a + b`. Under the
working hypothesis of equal frequencies within that pair, each expected count
is `E = N/2`. The Pearson contribution is:

```text
X_pair = (a - E)^2 / E + (b - E)^2 / E
       = (a - b)^2 / (a + b)
```

Pairs with either expected count below the configured minimum are excluded.
The default minimum is 5, so only pairs with a combined count of at least 10
participate. This avoids division by zero and reduces sparse-table problems.

Conditioning on a pair's total leaves two categories with one constraint, hence
one degree of freedom per eligible pair. Channel statistics are added, and the
reported degrees of freedom equal the total eligible-pair count across the three
channels, at most 384. There is no additional subtraction of one from this total:
each pair has already been treated as a separate conditional two-bin test.

RGB samples and neighboring pixels are not generally independent. Consequently,
the reference chi-square distribution is an approximation for real images and
must not be interpreted as a calibrated forensic probability.

## Probability calculation

The reported `p_value` is the upper-tail probability:

```text
p_value = P(ChiSquare(df) >= observed_statistic)
        = Q(df/2, observed_statistic/2)
```

`Q` is the regularized upper incomplete gamma function. This follows the
chi-square/gamma relationship documented by [NIST](https://www.itl.nist.gov/div898/handbook/eda/section3/eda3666.htm).
The implementation uses a convergent series in the lower region and a continued
fraction in the upper region, with log-space scaling and a bounded iteration
count. Integer and half-integer gamma shapes cover all supported degrees.

Tests check reference 5-percent quantiles, exact two-degree exponential tails,
probability bounds and monotonicity. An additional independent 45-case check
using Python decimal arithmetic for even degrees and an erfc/gamma recurrence for
odd degrees produced maximum absolute error approximately `6.11e-14` on the
checked grid. This is an observed validation result, not a universal error bound.
Extremely small probabilities may underflow to numeric zero.

When no pairs qualify, `p_value`, `chi_square` and `anomaly_score` are `null`.
No probability is fabricated for an empty test.

## Indicators

| Field | Meaning |
| --- | --- |
| `chi_square` | Sum of eligible pair contributions across RGB channels. |
| `degrees_of_freedom` | Number of eligible channel/pair combinations. |
| `p_value` | Upper-tail compatibility probability under the equal-pair working hypothesis. |
| `anomaly_score` | Exactly `p_value`, retained as the project's compatibility score. |
| `lsb_ratio` | Fraction of all RGB samples whose least significant bit is 1. |
| `threshold` | Suspicious compatibility threshold. |
| `clear_threshold` | Strong-rejection threshold used by this technique. |
| `balance_tolerance` | Maximum permitted distance of the global LSB ratio from 0.5 for a suspicious classification. |
| `pixel_count` | Number of decoded pixels. |
| `sample_count` | Three times `pixel_count`, excluding alpha. |
| `coverage` | Fraction of RGB samples included in eligible pairs. |

`channels` reports the statistic, probability, eligible-pair count, coverage and
LSB ratio separately for red, green and blue. Channel probabilities are evidence
for inspection; classification uses the combined statistic and the sufficiency
checks below.

A high `anomaly_score` is not the probability that data was hidden. In particular,
failure to reject pair equality does not establish an embedding operation.

## Parameters and classification policy

| Variable | Default | Purpose |
| --- | --- | --- |
| `LSB_SUSPICIOUS_THRESHOLD` | `0.05` | Minimum upper-tail probability for compatibility screening. |
| `LSB_CLEAR_THRESHOLD` | `0.001` | Maximum probability for strong rejection of pair balance. |
| `LSB_BALANCE_TOLERANCE` | `0.02` | Global LSB ratio must fall between 0.48 and 0.52 for a suspicious result. |
| `LSB_MIN_PIXELS` | `4096` | Minimum image size for a classification beyond inconclusive. |
| `LSB_MIN_EXPECTED_COUNT` | `5` | Minimum expected count per bin. |
| `LSB_MIN_PAIRS` | `32` | Minimum eligible pairs in each channel. |
| `LSB_MIN_COVERAGE` | `0.8` | Minimum included-sample fraction in each channel. |

Thresholds must satisfy `0 < clear_threshold < threshold < 1`. Other settings
are range-checked at startup. Defaults are explicit engineering screening choices,
not thresholds learned or validated on a representative labeled image corpus.
The 0.05 compatibility cutoff uses a familiar hypothesis-test reference; it is
not a 5-percent false-positive rate for steganography detection. The stronger
0.001 rejection cutoff leaves an inconclusive band. Diversity, coverage and
balance requirements reduce particular misleading cases, but do not establish
measured sensitivity or specificity.

Classification order is:

1. Invalid internal pixel data or numerical failure: `error`, with no fabricated
   successful metrics.
2. Fewer than 4096 pixels: `no_concluyente` / `insufficient_samples`.
3. Insufficient pairs or coverage in any channel: `no_concluyente` /
   `insufficient_pair_coverage`.
4. Sufficient evidence, `p_value >= 0.05` and `abs(lsb_ratio - 0.5) <= 0.02`:
   `sospechoso` / `pair_balance_compatible`.
5. Sufficient evidence and `p_value <= 0.001`: `sin_indicios` /
   `pair_balance_rejected`.
6. Remaining cases: `no_concluyente` / `ambiguous_evidence`.

These labels describe this technique's evidence. `sin_indicios` does not mean
that an image is safe or contains no hidden information. Malformed uploads still
receive `400`, excessive processing limits `413`, and unsupported formats `415`
before a successful analysis response. Worker infrastructure failures remain
`503`; they are not converted into clean classifications.

## Isolation and API response

Decoding, histogram collection and detection run in the same bounded worker.
Only metadata and statistical evidence return to the API process for analysis
requests; decoded pixels are cleared in the worker. The existing processing
deadline and shared concurrency permits cover the complete job. `IMAGE_DECODE_TIMEOUT_MS`
therefore limits decoding plus detection despite its original configuration name.
The upload interceptor clears the original in-memory upload after completion.

`POST /api/v1/steganography/analyze` now returns the classification, technique,
indicators, channel evidence, reason, limitations and an ISO `analyzed_at` value,
along with original-file SHA-256 and validated image metadata. Swagger documents
the complete response.

The earlier `status: "validated"` response has been replaced by the four analysis
statuses. Results now persist with `analysis_id`; `upload_id` is retained as an alias.
Policy snapshots, protected retrieval, private quarantine and expiry are documented
in [Results and storage](RESULTS_STORAGE.md). The detector and its limitations are
independent of the configured content policy.

## Reproducible sample construction

From `ms-stego/`:

```bash
pnpm samples:generate
```

This compiles and regenerates `samples/`, including PNG/BMP pairs, controls,
invalid files, `payload.txt` and `manifest.json`. Only the named sample artifacts
are overwritten. The manifest records hashes, byte lengths, ground truth,
configuration and actual detector output. No timestamp is included. Encoded
bytes are reproducible with the recorded Node/toolchain; changes to zlib, Node,
encoder versions or detector parameters can require a regenerated manifest.

The main cover is a synthetic 128×128 image whose RGB high bits come from a fixed
SHA-256 counter stream and whose LSBs are zero. It is deliberately biased to make
the demonstration understandable. It is not a natural photograph or evidence
that untouched images generally have zero LSBs.

The embedded sample contains the 99-byte message in `payload.txt`, framed with a
magic value, length and SHA-256 checksum. Deterministic padding fills the RGB
capacity, and a separate public SHA-256 counter stream whitens the packet before
sequential LSB replacement. Whitening models a randomized payload for the test;
it is not a confidentiality mechanism. All seeds and the recovery algorithm are
public in `src/tools/samples/`.

There are 49152 available RGB samples. The frame and padding occupy all of them;
24617 sample values change, each by at most one, and alpha is unchanged. Tests
recover the exact original message from both PNG and BMP and verify its checksum.
The detector itself does not use the known message or generator seed.

## Observed results

These results are measured on the committed synthetic suite with default settings:

| Sample | Ground truth | Chi-square | df | p-value | LSB ratio | Result |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| `original.png` / `.bmp` | Synthetic biased cover; no embedded message | 49152 | 384 | 0 (underflow) | 0 | `sin_indicios` |
| `lsb-payload.png` / `.bmp` | Known full-capacity LSB replacement message | 360.722103 | 384 | 0.7976862485 | 0.5008341471 | `sospechoso` |
| `noise-control.png` | Generated noise; no embedding operation | 370.349790 | 384 | 0.6823886449 | 0.5022176107 | `sospechoso` — known false positive |
| `small.png` | 16×16 control | Not applicable | 0 | `null` | 0 | `no_concluyente` |
| `flat-control.png` | Constant-color control | 49152 | 3 | 0 (underflow) | 0 | `no_concluyente` — insufficient diversity |
| `corrupt.png` | Truncated PNG | Not run | — | — | — | HTTP `400` |
| `false-extension.png` | Valid 1×1 GIF renamed `.png` | Not run | — | — | — | HTTP `415` |

PNG and BMP preserve identical RGB samples and produce identical evidence for
the original/payload pairs, although their file hashes differ.

## Limitations and interpretation

- Natural or synthetic noise, dithering, quantization and previous image
  processing can produce balanced pairs without any hidden message.
- Under an ideal equal-pair null model, a 0.05 compatibility screen would retain
  approximately 95 percent of such inputs before additional gates. Therefore
  high false-positive rates on noise-like covers are expected, not evidence of
  a calibrated steganography detector.
- The supplied known false positive is intentionally retained in the results.
  It must not be removed to improve the demonstration.
- The synthetic biased cover and full-capacity randomized payload are controlled
  examples, not a representative accuracy benchmark.
- Whole-image histograms can dilute short or localized payloads. Single-channel
  embedding, low embedding rates, nonrandom messages, LSB matching, adaptive
  methods and embedding outside RGB LSBs can evade the test.
- Spatial and cross-channel dependencies weaken the reference distribution's
  assumptions. A larger empirical evaluation is required before tuning thresholds
  or reporting detection rates for real-world images.
- Flat and sparse images cannot support the chosen test and remain inconclusive.
- No message extraction, signature of a specific steganography tool or definitive
  claim of hidden content is provided by the API.

## Verification and presentation

```bash
pnpm lint
pnpm test
pnpm test:e2e
pnpm samples:generate
```

The optional independent numerical check requires Python 3 and only its standard
library. After compilation, run `python3 scripts/check-chi-square.py`.

The unit suite validates probability calculations, histograms, alpha exclusion,
coverage gates, threshold boundaries, numerical failures, deterministic sample
bytes, payload recovery and pixel changes. HTTP tests replay every sample through
real authorization guards and workers using an HTTPS AUTH fixture and compare the
returned evidence with the manifest. Joint verification with the team's AUTH
implementation remains pending.

For the presentation, submit `original.png`, `lsb-payload.png` and
`noise-control.png` using an authorized token. Show the measured metrics and the
known false positive, then submit `small.png`, `corrupt.png` and
`false-extension.png` to demonstrate uncertainty and safe rejection. Retain the
request, response and HTTP code in Postman evidence. Repeat the main pair in BMP
if format equivalence needs to be demonstrated.

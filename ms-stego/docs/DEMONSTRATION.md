# STEGO demonstration rehearsal

## Preparation

From `ms-stego/`, verify dependencies and run the independent rehearsal:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm test
pnpm test:e2e
pnpm test:integration
pnpm openapi:export
pnpm evidence:generate
```

Docker and OpenSSL are required by the delivery commands. They use isolated
resources and do not need the team's AUTH or Compose deployment. Inspect the
responses in [the local report](evidence/local/report.json) while practicing the
explanation below. This is an automated local rehearsal; it does not leave a
fixture server running for manual requests.

For the final live demo, Erick must start the integrated services with migrations,
trusted certificates, independent databases and a private persistent quarantine
volume. Jonathan must prepare two ANALYST users, a USER and an ADMIN. Keep their
tokens private. Confirm STEGO health and Swagger before beginning.

## Mateo's sequence

1. Explain that STEGO authenticates the JWT and asks AUTH for current permission
   on every operation. It never reads AUTH's database. Processing starts only
   after both checks succeed.
2. Analyze `samples/original.png`. Show `sin_indicios`, its hash, measured metrics,
   `analysis_id` and the default `advertencia` decision. The original is a synthetic
   biased control without an embedded message; this result is not proof that all
   possible hidden content is absent.
3. Analyze `samples/lsb-payload.png`. Show `sospechoso`, the policy snapshot and
   quarantine state. Its p-value is about `0.797686`, with LSB ratio about
   `0.500834`. The sample has a known LSB replacement payload. STEGO reports
   statistical evidence; it does not extract that message through the API.
4. Explain the chi-square comparison of adjacent histogram bins. LSB replacement
   can equalize the bins. The p-value measures compatibility with that reference
   model, not the probability that a message is hidden. `anomaly_score` is the
   same compatibility score in this version, not a calibrated confidence.
5. Analyze `samples/noise-control.png`. It is also `sospechoso`, despite having no
   embedding operation. Present this known false positive explicitly. The sample
   suite is a controlled demonstration, not a detection accuracy benchmark.
6. Analyze `samples/small.png`. Explain `no_concluyente`: the evidence is
   insufficient. Show `corrupt.png` returning `400`, `false-extension.png`
   returning `415`, and an oversized file returning `413`.
7. Retrieve the payload analysis using its returned ID. Show that the stored
   evidence and policy are preserved. With the second ANALYST, repeat the read
   and show `403`; with ADMIN, show the access granted by AUTH's any scope.
8. Show the correlation ID and depurated audit excerpt. Explain that quarantined
   bytes are private, bounded and deleted after expiry; the analysis and audit
   remain. There is no public file download route.
9. Hand over to Jonathan and Erick for real role removal with the same token and
   AUTH unavailability. State the expected `403` and `503` outcomes and show
   that no new analysis is created for either denied operation.

If time permits, repeat the original/payload pair in BMP. RGB evidence is the
same for the generated PNG/BMP pairs, while file hashes differ.

## Manual HTTP requests

These commands target the real integrated service after it is available.
Provide `STEGO_ORIGIN` as an origin without `/api/v1` and `ACCESS_TOKEN` locally.

```bash
curl --fail-with-body -i \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -F "file=@samples/original.png;type=image/png" \
  "$STEGO_ORIGIN/api/v1/steganography/analyze"

curl --fail-with-body -i \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -F "file=@samples/lsb-payload.png;type=image/png" \
  "$STEGO_ORIGIN/api/v1/steganography/analyze"

curl --fail-with-body -i \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  "$STEGO_ORIGIN/api/v1/steganography/results/$ANALYSIS_ID"
```

Use the returned ID for `ANALYSIS_ID`; each POST creates a new analysis. Compare
numbers against [samples/manifest.json](../samples/manifest.json), not a screenshot
from a different configuration. Do not change thresholds to hide the noise result.
The [Spanish Postman collection](../postman/README.md) is available through MCP
and as exported JSON. Final execution screenshots remain pending real AUTH and
the integrated environment.

## Answers to likely questions

| Question | Answer |
| --- | --- |
| Does a suspicious result prove hidden content? | No. Noise and previous processing can also equalize histogram pairs. |
| Does a clear result prove absence? | No. Other techniques, short payloads and localized embedding can evade this method. |
| Why can p-value be zero or null? | Zero can be numerical underflow for an extreme statistic; null means no supported probability was computed. |
| Why can HTTP 200 contain rejection? | The analysis completed successfully; rejection is the content policy recorded in the response. |
| Why does an ordinary image receive warning? | Warning is the contract's default non-retention policy, not a claim of detected hidden data. |
| What happens if AUTH fails? | STEGO returns 503 and does not process the upload. |
| Does file expiry erase the analysis? | No. It deletes retained original bytes while preserving metadata, policy and audit. |
| What has been verified jointly? | Local fixture verification is complete; real AUTH and final Compose verification remain pending. |

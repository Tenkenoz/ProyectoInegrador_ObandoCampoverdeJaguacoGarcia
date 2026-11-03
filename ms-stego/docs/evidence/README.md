# Local evidence and final integration captures

The committed artifacts under [local/](local/) are actual local test results,
using the STEGO controllers, guards, workers, migrations and repositories with an
isolated PostgreSQL container and a temporary HTTPS AUTH fixture. They are not
Postman screenshots or proof of interoperability with the team's AUTH service.

## Reproduce

From `ms-stego/`, with dependencies installed, Docker running and OpenSSL available:

```bash
pnpm evidence:generate
```

The command builds the service, executes all evidence assertions, then writes:

- [local/report.json](local/report.json): environment, limitations, source hashes,
  requests described without credentials, HTTP codes, request IDs and actual responses.
- [local/audit.json](local/audit.json): persisted audit events from the same run,
  restricted to identifiers, dates, outcomes and approved detail fields.

The current run contains 22 HTTP scenarios and 48 persisted audit events. It also
verifies the hashes of all nine committed image samples and the exact bytes of
five quarantined originals. Changing samples or behavior can change these counts.
Artifacts are written after all assertions pass. On failure, an older artifact can
remain on disk; check the command exit status and `completed_at` before using it.
Dates and generated UUIDs change on each run. `source.files` hashes the source,
package metadata, lockfile and sample manifest; `source.digest` hashes that sorted
file list. This identifies the application inputs without relying on a commit hash
that changes when the generated evidence is committed.

No JWT, HMAC secret, signing key, image bytes, request header or query-string value
is exported. The report includes original filenames from the synthetic fixtures as
analysis metadata; the audit artifact excludes them. Random subject and resource
UUIDs belong to the isolated run. The temporary database, keys and private storage
are removed afterwards. The cleanup scheduler is disabled for deterministic capture;
retention and recovery remain covered by `pnpm test:integration`.

## Coverage and remaining proof

| Assignment test | Local evidence | Final team evidence still needed |
| --- | --- | --- |
| T03 | Missing, tampered and expired RSA tokens return `401`. | Repeat with tokens issued by real AUTH. |
| T04 | A denied fixture decision returns `403`, without persisting an analysis. | Log in as a real USER and demonstrate the actual role denial. |
| T07 | The same token succeeds, then receives `403` after the fixture changes its decision. | Jonathan removes a real role; repeat with the unchanged token. |
| T09 | All seven analyzable samples match their manifest metrics and classifications. | Capture original/payload requests in the integrated environment. |
| T10 | Corrupt, disguised, oversized and missing uploads return `400`, `415`, `413` and `400`. | Repeat through the final deployment and capture responses. |
| T11 | Own scope reads an owned record, denies a record assigned to another fixture subject, and any scope permits access. | Use two real ANALYST users and an ADMIN. |
| T12 | Every captured HTTP request has a matching persisted event; probes and credentials are absent from audit. | Review and capture the final deployment's depurated logs and database evidence. |
| AUTH outage | A fixture `503` prevents a new analysis. | Stop or isolate real AUTH and demonstrate STEGO's `503`. |

The fixture simulates authorization decisions. It does not create real users,
roles or user-role associations. Ownership is changed directly only inside the
dedicated evidence database to exercise the actual STEGO ownership check.

## Review persisted audit in the integrated environment

After creating an analysis, obtain its `analysis_id` and run the read-only query:

```bash
psql "$STEGO_DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -v analysis_id="$ANALYSIS_ID" -f docs/evidence/audit-review.sql
```

Supply the database URL locally. The query exports selected analysis fields and
audit events correlated by resource and request ID. It does not select image
bytes, filenames or credentials. Have the database operator run it if direct
database access is unavailable. Keep this output with the matching HTTP capture.

## Capture requirements after connecting Postman MCP

Postman work is intentionally pending. Once the MCP is connected, create a
collection from the OpenAPI contract and configure service origins and tokens in
local environment values. Use the case matrix above as the execution order.

Each final capture should show the test ID, method, route, sample name when
applicable, HTTP status, response body and `X-Request-Id`. For T07, show both
requests and the role removal while proving the token was unchanged without
displaying its value. For T09, retain the original, payload and known noise false
positive. For T11, distinguish owner, another ANALYST and ADMIN.

Hide Authorization headers, login credentials, private environment values, service
signatures and signing material before sharing captures. Record the tested commit,
runtime configuration and date. Final captures go to Campoverde together with the
corresponding audit excerpts. No team evidence or screenshots are claimed by the
local artifacts in this directory.

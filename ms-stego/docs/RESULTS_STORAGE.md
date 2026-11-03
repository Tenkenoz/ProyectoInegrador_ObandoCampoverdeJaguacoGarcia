# Persistent results, policies, quarantine and audit

## Execution requirements

Apply migrations before starting the API:

```bash
pnpm migration:run
pnpm start:dev
```

The second migration extends `analyses` with complete metadata, a policy snapshot,
quarantine lifecycle fields and an expiry index, and creates `audit_events`.
Existing rows are preserved. Missing historical metadata remains `null`; legacy
results are explicitly marked instead of receiving invented metrics or dates.
The initial schema is still prepared by the first migration. Automatic schema
synchronization and automatic startup migrations remain disabled.

PostgreSQL and the quarantine volume belong exclusively to STEGO. No AUTH tables,
credentials or private keys are used for persistence.

## Analysis and retrieval

`POST /api/v1/steganography/analyze` still requires a valid JWT and a fresh AUTH
decision for `steganography.analyze`. After validation and LSB analysis, it applies
a policy and persists the result before acknowledging success. The response now
includes a durable `analysis_id`. The existing `upload_id` field is retained as
an alias of that identifier for compatibility.

Persisted evidence includes the requester, generated filename, original display
filename, SHA-256 of the original bytes, technique, metrics including nullable
probabilities, channel evidence, classification, reason, limitations, dimensions,
size, analysis time and detector configuration. The policy and its configuration
are snapshots: reading an old result does not reinterpret it using current settings.

```bash
curl --fail-with-body \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -F "file=@samples/lsb-payload.png;type=image/png" \
  http://localhost:3002/api/v1/steganography/analyze
```

Retrieve the record using:

```bash
curl --fail-with-body \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  "http://localhost:3002/api/v1/steganography/results/$ANALYSIS_ID"
```

`GET /api/v1/steganography/results/:id` obtains a fresh AUTH decision for
`steganography.results.read` and that exact UUID. STEGO checks the verified subject,
action and resource again in the result service. With `scope: own`, the requester
must own the persisted row; `scope: any` allows the ADMIN access granted by AUTH.
Client headers, query strings and body fields cannot supply a scope or owner.

Missing/invalid authentication returns `401`; denied access or another owner's
result returns `403`; a malformed UUID returns `400`; an authorized lookup of an
absent record returns `404`. Database or mandatory read-audit failures return
`503`, without disclosing the stored result. The `403`/`404` distinction follows
the approved contract and exposes limited existence information to already
authorized result readers.

Each POST creates a new record. This is not an HTTP idempotency-key API. A lost
database commit acknowledgement is resolved by checking the generated identifier
and matching the input fingerprint; retries sent as separate HTTP requests can
create separate analyses.

## Applied policies

| Detection status | Default action | Original bytes |
| --- | --- | --- |
| `sin_indicios` | `advertencia` | Discard after processing. |
| `sospechoso` | `cuarentena` | Retain in private quarantine until expiry. |
| `no_concluyente` | `advertencia` | Discard after processing. |
| `error` | `rechazo` | Discard after processing. |

`POLICY_SUSPICIOUS_ACTION` and `POLICY_INCONCLUSIVE_ACTION` accept `advertencia`,
`cuarentena` or `rechazo`. Errors always select rejection. Other states cannot
silently bypass the configured action.

The `action` field is a content policy, separate from HTTP authorization. A `200`
response can report `rechazo`: the analysis operation completed and recorded a
rejection decision, while the original image was discarded. No image is published
or forwarded to a chat. `advertencia` is an explicit API warning decision, not an
email or external notification. A statistical suspicion, including the known noise
false positive, receives the same configured policy as any equivalent evidence.

The policy snapshot contains `version`, `action`, an English reason code,
`retention_seconds` and the configured screening actions. Policy version is
`stego_policy_v1`; current default reason codes include `suspicious_quarantine`,
`inconclusive_warning`, `no_indicators_warning` and `analysis_error_rejection`.

## Private storage and limits

| Variable | Default | Allowed values |
| --- | --- | --- |
| `QUARANTINE_DIR` | Absolute `storage/quarantine` under the application working directory | Absolute path when explicitly configured. |
| `QUARANTINE_RETENTION_SECONDS` | `86400` (24 hours) | 60–604800. |
| `QUARANTINE_MAX_BYTES` | `104857600` (100 MiB) | 1–1073741824. |
| `QUARANTINE_MAX_FILES` | `100` | 1–1000. |
| `QUARANTINE_CLEANUP_INTERVAL_MS` | `60000` | 1000–3600000. |
| `QUARANTINE_ORPHAN_GRACE_SECONDS` | `300` | 60–86400. |

Configuration is read at startup. Change environment values and restart the
service to apply new settings. Existing policy snapshots and expiry dates remain
unchanged.

The application initializes a dedicated directory owned by its OS user with no
group/world permissions. It refuses a symlinked, replaced or insecure root. Managed
files use generated UUID names with the `.bin` extension and mode `0600` in a
`0700` directory. Original filenames are display metadata and never filesystem
paths. Writes use exclusive creation and no-follow flags, and synchronize the file
and directory before database acknowledgement. Existing files are not overwritten.
Unexpected directory entries or insecure managed files cause storage operations
to fail closed.

Capacity checks use actual managed-file sizes and counts. An exhausted or unavailable
quarantine returns `503`; no false retained result is created and no fallback
warning policy is substituted. A process-local mutex protects filesystem operations,
and a PostgreSQL advisory transaction lock serializes capacity-sensitive API writes
across processes using the same database and dedicated volume.

All original bytes are retained only for `cuarentena`. Other actions leave no image
file. Upload and private pipeline buffers are cleared after use. A separate
pipeline permit remains held through persistence, bounding retained private copies
even if a client disconnects. An authorized operation already running can finish
after a disconnect; the HTTP audit then records the interrupted connection.

There is no quarantine download or static-file route. Neither a path nor a storage
key appears in API responses. Directory permissions isolate other OS users; they
do not protect against a privileged host administrator. File deletion is unlinking,
not a claim of forensic erasure from backups or storage snapshots.

## Docker volume

The image prepares `/app/storage/quarantine` for the unprivileged `node` user.
Use a persistent named volume in addition to persistent PostgreSQL storage:

```bash
docker volume create stego-quarantine
docker run -d --name stego --network stego-local --env-file .env \
  -e DB_HOST=stego-db -e DB_PORT=5432 \
  --mount type=volume,src=stego-quarantine,dst=/app/storage/quarantine \
  --mount type=bind,src="$(pwd)/certs/auth-ca.pem",dst=/run/certs/auth-ca.pem,readonly \
  -p 127.0.0.1:3002:3002 ms-stego:local
```

For a host bind mount, provision ownership for the container user and mode `0700`
before starting it. Do not mount a general-purpose directory. Instances using the
same database must use the same dedicated quarantine volume. Both `storage/` and
`certs/` are excluded from Git and the Docker build context. Erick's Compose setup
must mount this volume and keep it private; Docker Compose integration remains his
team responsibility.

## Retention, recovery and consistency

Filesystem effects and PostgreSQL are different resources; there is no claim of a
single atomic commit across both. The protocol is:

1. Begin a database transaction and reserve the generated key with a PostgreSQL
   advisory lock. Quarantine writes also reserve the shared capacity lock.
2. When selected by policy, write and synchronize the original bytes privately.
3. Save the complete analysis and its critical `analysis.completed`, `policy.applied`
   and, when applicable, `quarantine.stored` audit events in the same transaction.
4. Return success only after the transaction commits.
5. If persistence fails and absence is confirmed, remove the written file. If
   commit status cannot be checked, retain it privately until reconciliation.
   A matching committed record can recover a lost acknowledgement without
   duplicating the analysis or removing its file.

Cleanup runs once after application initialization and periodically afterwards.
It does not overlap itself within a process. Each sweep handles at most 1000
retained database rows, removes expired bytes, marks missing files, and reconciles
old generated files after the orphan grace period. It confirms database state
before orphan deletion and uses a nonblocking advisory key reservation to skip
in-flight writes, including writes from another process. Files associated with an
existing non-deleted record are preserved. Database unavailability prevents orphan
deletion.

Deleting an expired file does not delete its analysis or historical policy.
`quarantine.state` can be `none`, `stored`, `missing` or `deleted`; expiry and
confirmed deletion timestamps are returned separately. Interrupted expiry updates
can be repaired on the next sweep. The state describes managed lifecycle and
presence observations, not a cryptographic anti-tamper guarantee. Under normal
operation deletion occurs on a sweep after expiry, not at an exact wall-clock second.

Run a sweep manually with:

```bash
pnpm quarantine:cleanup
```

This command requires STEGO database and quarantine configuration, but no AUTH
certificate, JWT signing key or HMAC secret. It does not run migrations automatically
or expose a maintenance HTTP endpoint. It prints a report with `deleted`, `missing`
and `orphans` counts and exits unsuccessfully if maintenance cannot complete.

Analysis and audit records are retained after file expiry. Their eventual archival
or deletion is a separate operator retention decision.

## Audit behavior

Every matched API request receives a server-generated `X-Request-Id`. The client
cannot choose it. The same UUID is `requestId` in structured logs and `request_id`
in PostgreSQL. Audit records include time, subject when verified, action, resource,
outcome, HTTP status and a bounded allowlist of detail fields. A connection closed
before completion is logged with observational status `499`.

The audit path never copies request headers, query strings, bodies, original
filenames, image bytes, JWTs, service signatures, HMAC secrets, private keys or raw
dependency exceptions. Structured event details are restricted to known methods,
classification/action/state enums, policy version and boolean markers.

Critical analysis/policy/storage events are part of the analysis transaction.
Successful result reads also require a committed durable `analysis.read` event
before returning the content. Ownership denials are audited. File expiry and
reconciliation produce lifecycle events.

HTTP completion records are logged immediately and persisted best-effort using a
bounded queue of 32 concurrent writes. If PostgreSQL fails or that queue is full,
stdout receives a sanitized audit-delivery event. This does not weaken access
control. Operators must retain application logs independently; no database can
persist its own outage synchronously. Shutdown waits for outstanding audit writes
and scheduled maintenance where available.

For database evidence, inspect:

```sql
SELECT created_at, request_id, subject_id, resource_id, event, outcome, http_status
FROM audit_events
ORDER BY created_at DESC
LIMIT 50;
```

Application logs use the `SecurityAudit` logger and contain JSON payloads. No
external logging service or telemetry account is configured by this change.

## Verification and limits

```bash
pnpm lint
pnpm test
pnpm test:e2e
pnpm test:integration
```

The integration command requires Docker. It creates isolated PostgreSQL containers
with random names and ports, applies the real migrations, runs the API against an
HTTPS AUTH fixture and temporary private directories, and removes its test resources.
It does not connect to an existing application database.

Coverage includes schema upgrade/revert compatibility, transaction rollback when
critical audit fails, ownership/ADMIN scope, policy snapshots, byte preservation,
warning/rejection without storage, expiry, missing/orphan files, quotas, lost
acknowledgements, active-transaction cleanup exclusion, interrupted deletion repair,
secret redaction and refusal to disclose results without mandatory read auditing.
The Docker runtime check also verifies volume-backed persistence across API restarts.

Joint verification with Jonathan's AUTH and Erick's final Compose deployment remains
pending. The statistical limitations documented in [LSB technique](TECNICA_LSB.md),
including the known noise false positive, remain unchanged.

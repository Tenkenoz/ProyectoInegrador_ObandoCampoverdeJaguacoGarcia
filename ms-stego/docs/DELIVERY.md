# STEGO delivery status and team handoff

## Ready for review

STEGO implements authorized PNG/BMP analysis, statistical LSB evidence, persistent
results, content policies, private quarantine, ownership checks and depurated
audit. Code follows feature modules and separates processing, persistence, policy,
storage and utility functions. The application uses pnpm.

| Material | Location |
| --- | --- |
| Execution, configuration, Docker and migrations | [Service README](../README.md) |
| Agreed AUTH integration contract | [AUTH–STEGO contract](../../CONTRATO_AUTH_STEGO.md) |
| JWT, JWKS, HTTPS, HMAC and authorization behavior | [Security](SECURITY.md) |
| File validation and supported encodings | [Uploads](UPLOADS.md) |
| Method, metrics, parameters and limitations | [LSB technique](TECNICA_LSB.md) |
| Reproducible images and ground truth | [Samples](../samples/README.md) and [manifest](../samples/manifest.json) |
| Policies, schema, quarantine, retention and audit | [Results and storage](RESULTS_STORAGE.md) |
| Exported service API contract | [OpenAPI YAML](openapi/stego.yaml) and [regeneration instructions](openapi/README.md) |
| Local test evidence and final capture matrix | [Evidence guide](evidence/README.md) |
| Local HTTP results and actual persisted audit | [Report](evidence/local/report.json) and [audit](evidence/local/audit.json) |
| Correlated database evidence | [Read-only SQL](evidence/audit-review.sql) |
| Presentation sequence and manual requests | [Demonstration rehearsal](DEMONSTRATION.md) |

The local suite contains 208 unit tests, 48 HTTP tests and 24 PostgreSQL integration
tests. The delivery commands add two artifact checks: OpenAPI export and 22 local
HTTP evidence scenarios. Build and lint are required alongside these checks.
The previous storage runtime verification also confirmed Docker volume persistence
after API recreation and standalone expiry cleanup without AUTH.

Local evidence uses a temporary AUTH fixture with real cryptographic operations.
It does not establish compatibility with the team's running AUTH or constitute
the assignment's final Postman captures. No external workspace has been modified
and no material has been sent to teammates by these changes.

## Pending tasks

| Status | Task | Dependency and completion evidence |
| --- | --- | --- |
| Pending | Connect Postman MCP. | Mateo connects the intended Postman account/workspace. |
| Pending | Create/import the STEGO collection and environments through MCP. | Postman connection; use the generated OpenAPI and capture matrix. |
| Pending | Capture T03, T04, T07, T09, T10, T11 and T12 in Postman. | Connected MCP, real AUTH accounts/roles and the integrated deployment. |
| Pending | Verify real JWT issuance, JWKS and current permission checks. | Jonathan exposes the agreed HTTPS/JWKS/HMAC endpoints and provides test accounts. |
| Pending | Demonstrate real role removal with the unchanged JWT. | Jonathan removes a role; the next STEGO operation returns 403 without a new analysis. |
| Pending | Demonstrate real AUTH unavailability. | Jonathan/Erick stop or isolate AUTH; STEGO returns 503 without a new analysis. |
| Pending | Verify two ANALYST owners and ADMIN access. | Jonathan prepares accounts; T11 confirms own/any scope against real AUTH. |
| Pending | Integrate STEGO into the final Compose deployment. | Erick configures network, certificates, migrations, independent databases and persistent private storage. |
| Pending | Repeat persistence, restart and retention checks in final Compose. | Erick's deployment is available; results survive recreation and expired original bytes are removed. |
| Pending | Deliver reviewed documentation and final evidence to Campoverde. | Mateo reviews the captures and audit excerpts; Campoverde incorporates them into the report. |
| Pending | Rehearse the complete team presentation. | All team members and the integrated environment are available. |

## Information needed for joint integration

Jonathan supplies the AUTH HTTPS origin, trusted CA distribution, published JWKS
endpoint, agreed service identity/secret through a private channel, test accounts
and a way to change their current roles. Public keys come from trusted JWKS; STEGO
does not need AUTH signing private keys or database access.

Erick supplies the Compose configuration, service DNS names, private volume and
certificate mounts, migration procedure and restart controls. The quarantine
directory must be owned by the service user with mode 0700; instances sharing the
same STEGO database must share the dedicated quarantine volume. Refer to the
service README and storage guide for the full settings.

Campoverde can review all linked materials now. Final report consolidation must
label local fixture evidence separately from final integrated captures and retain
the documented false positive. The final packet should include the tested commit,
configuration, sample hashes, request/response/status captures, matching request
IDs and depurated audit excerpts.

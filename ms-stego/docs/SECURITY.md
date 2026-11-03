# Authentication and authorization

STEGO implements the client side of the root `CONTRATO_AUTH_STEGO.md` contract.
AUTH must provide RS256 access tokens, JWKS, HTTPS and the internal HMAC-protected
authorization endpoint before the services can be integrated.

The implementation is organized under `src/auth/`:

| Component | Responsibility |
| --- | --- |
| `config/` | Validate trusted endpoints, CA path, service identity, secret and timeout. |
| `clients/` | Own the HTTPS agent and communicate with AUTH. |
| `services/jwks.service.ts` | Cache public keys and coordinate refreshes. |
| `services/jwt-verifier.service.ts` | Verify the signature and access-token claims. |
| `services/authorization.service.ts` | Request and validate current permission decisions. |
| `guards/` | Authenticate and authorize before interceptors and handlers. |
| `decorators/` | Declare public routes and required actions. |
| `utils/` | Build signatures, parse decisions, extract tokens and enforce ownership. |

## Runtime configuration

Copy `.env.example` to `.env` and configure the following values:

| Variable | Meaning |
| --- | --- |
| `AUTH_BASE_URL` | Trusted HTTPS origin, default `https://auth:3001`. No path, credentials, query or fragment. |
| `AUTH_JWKS_URL` | Trusted HTTPS JWKS endpoint, default `https://auth:3001/.well-known/jwks.json`. |
| `AUTH_CA_CERT_PATH` | Required path to a readable PEM CA certificate. |
| `AUTH_SERVICE_ID` | `stego`. |
| `AUTH_SERVICE_SECRET` | Required 32-byte shared HMAC secret, encoded as 64 hexadecimal characters. |
| `AUTH_TIMEOUT_MS` | Complete request deadline, default `3000`, allowed range `1`–`30000`. |

Generate the HMAC secret locally and provide the same value to AUTH:

```bash
openssl rand -hex 32
```

Keep the secret in environment configuration outside version control. The example
intentionally leaves it empty. The server refuses to start with an invalid secret
or missing/malformed CA certificate. Database migration commands only require the
database configuration; they do not initialize the authentication module.

For local execution, point the URLs at the hostname and port where AUTH is
reachable and set `AUTH_CA_CERT_PATH` to the local CA certificate path. The server
certificate must be valid for that hostname. Never disable certificate validation.

For Docker, mount the CA read-only at the configured path. For example, with the
public CA certificate stored locally as `certs/auth-ca.pem`:

```bash
docker run -d --name stego --network stego-local --env-file .env \
  --mount type=bind,src="$(pwd)/certs/auth-ca.pem",dst=/run/certs/auth-ca.pem,readonly \
  -e DB_HOST=stego-db -e DB_PORT=5432 \
  -p 127.0.0.1:3002:3002 ms-stego:local
```

AUTH must also be reachable as `auth` on this network using HTTPS on port 3001.
The `certs/` directory is excluded from Git and the Docker build context. Mount
only the CA certificate in STEGO, never AUTH's private signing or TLS keys.

## Token validation and JWKS

Tokens must use RS256 and carry a nonempty `kid` header. Required claims are
`sub`, `iss`, `aud`, `iat`, `exp`, `typ` and `tokenVersion`.

- Issuer: `secure-chat-auth`.
- Audience: `secure-chat-api`.
- Subject: a UUID.
- Payload type: `access`.
- Session version: a nonnegative integer.
- Maximum lifetime and age: 900 seconds.
- Clock tolerance: 5 seconds.
- A supplied `nbf` claim is enforced.
- Token length is limited to 8192 characters.

Tokens never select the JWKS URL. Only RSA public signing keys of at least 2048
bits are accepted. Duplicate key identifiers, private key fields and unusable key
sets are rejected. At most 16 keys are accepted in one response.

Public keys are cached for five minutes. Concurrent refreshes share one request.
Unknown identifiers can trigger a refresh at most once every 30 seconds globally
per STEGO process; the initial fetch also starts that cooldown. A confirmed unknown
key returns `401`. Failure to retrieve required keys returns `503`; expired keys
are not used as a fallback. Current authorization is still checked on every
protected operation, even when its public key is cached.

## Service authentication and HTTPS

`createServiceHeaders` builds the HMAC-SHA256 signature over the exact UTF-8 JSON
body sent to AUTH. The canonical message contains the service ID, HTTP method,
internal path, timestamp, nonce and SHA-256 body hash separated by LF, without a
trailing newline. Each request receives a fresh 32-byte nonce.

AUTH is responsible for verifying signatures, rejecting timestamps outside the
30-second window and recording accepted nonces for 60 seconds. STEGO does not
maintain AUTH's replay registry.

The HTTPS transport verifies the server certificate using the configured CA,
does not follow redirects, bounds responses to 64 KiB and accepts only JSON media
types. Requests have a complete deadline and no automatic authorization retries.
Compressed responses are rejected.

## Route protection

`AuthModule` registers two global guards in order:

1. `JwtAuthenticationGuard` verifies the bearer token and attaches `request.subject`.
2. `AuthorizationGuard` obtains a current decision and attaches `request.authorizationGrant`.

The health controller is explicitly public. Swagger and its JSON document are
also public. Other controllers require an explicit action policy; authenticated
requests to routes without one are denied with `403`.

Declare analysis operations with:

```typescript
@RequireAuthorization('steganography.analyze')
```

Declare result operations whose route parameter is `id` with:

```typescript
@RequireAuthorization('steganography.results.read', 'id')
```

These guards run before multipart interceptors. Future upload controllers must
keep file handling in interceptors or handlers, after the guards; do not add an
upload-processing middleware before them. Network ingress limits remain a
separate deployment requirement.

The authorization response must match the verified subject, requested action and
resource. `allowed` is a strict boolean; allowed decisions require `own` or `any`,
and denied decisions require `scope: null`. Decisions are never cached.

For result operations, the handler must load the resource and call
`assertResourceOwnership(request.authorizationGrant, result.userId)` before
returning its contents. The guard validates the requested resource identifier;
it cannot determine ownership without the persisted result. The production upload endpoint now uses these guards before multipart parsing;
see [Image uploads](UPLOADS.md). The result endpoint is pending.

## Failure behavior

| Condition | HTTP status |
| --- | --- |
| Missing, malformed, expired or invalid token | `401` |
| AUTH reports an inactive user or invalid/revoked session | `401` |
| AUTH denies the action | `403` |
| Resource ownership does not match the granted scope | `403` |
| A route has no explicit authorization policy | `403` |
| Malformed result UUID | `400` |
| AUTH timeout, TLS/network failure or unavailable JWKS | `503` |
| Invalid service credentials or inconsistent authorization response | `503` |

Dependency failures are logged with an event name, subject, action and resource.
Raw dependency errors, tokens, service secrets, signatures and authorization
request bodies are not logged. There is no permissive fallback when AUTH fails.

## Verification and integration limits

```bash
pnpm build
pnpm lint
pnpm test
pnpm test:e2e
```

Tests that create ephemeral HTTPS certificates require the `openssl` executable.
All temporary certificates and keys are generated per run and removed afterwards.
The HTTP integration suite uses the real guards, HTTPS client, HMAC signer and JWT
verification against a local HTTPS AUTH fixture with real RSA keys. Protected test
controllers exist only in the test suite and are never registered in production.

Coverage includes token errors, key cache/rotation, trusted and untrusted TLS,
response limits, HMAC request validation, changing authorization for the same JWT,
logout, client-supplied roles, ownership, missing policies and failures before
multipart processing.

These tests do not prove integration with Jonathan's running AUTH implementation.
Joint verification is pending until AUTH exposes the agreed HTTPS, JWKS, HMAC and
authorization interfaces. The upload endpoint validates images, while LSB detection and persistent result
endpoints remain pending.

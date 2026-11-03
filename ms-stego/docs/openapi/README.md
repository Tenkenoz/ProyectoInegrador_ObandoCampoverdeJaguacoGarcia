# STEGO OpenAPI artifact

[stego.yaml](stego.yaml) is generated from the application's real controllers,
DTOs and Swagger configuration. It describes public health, authorized image
analysis and protected result retrieval. It contains no deployment credentials.

Regenerate from `ms-stego/`:

```bash
pnpm openapi:export
```

The command builds the workers, starts an isolated PostgreSQL 17 Docker container
and a temporary HTTPS AUTH fixture, initializes the application and exports the
runtime `/docs-yaml` document. Docker and OpenSSL must be available. The temporary
database, certificates and quarantine directory are removed when the run finishes.
No running team service, local `.env` file or production database is required.

Before writing the artifact, the exporter checks the route set, bearer security,
multipart file requirement, expected HTTP responses and persisted result fields.
The exported paths already include `/api/v1`; configure a server origin without
adding that prefix again. No deployment-specific `servers` URL is embedded.

Regenerate after changing routes, DTOs or Swagger decorators. Review the YAML diff
and commit the artifact with the corresponding contract change. Runtime Swagger
remains available at `/docs`, with JSON at `/docs-json` and YAML at `/docs-yaml`.

The Spanish Postman collection and two credential-free environments are created
through MCP and exported under [postman/](../../postman/README.md). Final captures
against real AUTH and the team's deployment remain pending.

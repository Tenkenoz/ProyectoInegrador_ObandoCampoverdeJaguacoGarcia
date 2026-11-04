#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

const file = 'docs/openapi/auth.yaml';
const document = parse(readFileSync(file, 'utf8'));

if (!document || document.openapi !== '3.0.3') {
  throw new Error('docs/openapi/auth.yaml must use OpenAPI 3.0.3');
}

const requiredPaths = [
  '/api/v1/health',
  '/.well-known/jwks.json',
  '/api/v1/auth/login',
  '/api/v1/auth/profile',
  '/api/v1/auth/logout',
  '/api/v1/users',
  '/api/v1/roles',
  '/api/v1/user-roles',
  '/api/v1/audit-events',
  '/internal/authorization/check',
];

for (const path of requiredPaths) {
  if (!document.paths?.[path]) {
    throw new Error(`Missing OpenAPI path: ${path}`);
  }
}

const requiredSchemes = [
  'bearerAuth',
  'serviceId',
  'serviceTimestamp',
  'serviceNonce',
  'serviceSignature',
];

for (const scheme of requiredSchemes) {
  if (!document.components?.securitySchemes?.[scheme]) {
    throw new Error(`Missing security scheme: ${scheme}`);
  }
}

const serialized = JSON.stringify(document);

for (const forbidden of ['PRIVATE KEY', 'passwordHash', 'AUTH_SERVICE_SECRET=']) {
  if (serialized.includes(forbidden)) {
    throw new Error(`OpenAPI contract contains forbidden material: ${forbidden}`);
  }
}

console.log(`OpenAPI contract is valid: ${requiredPaths.length} required paths`);

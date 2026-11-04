#!/usr/bin/env bash
#
# Generates the local certificate authority and the TLS certificates used by
# the integration stack. Certificates are development material only and are
# never committed (see .gitignore).
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CERT_DIR="${ROOT_DIR}/docker/certs"
FORCE="${1:-}"

mkdir -p "${CERT_DIR}"

function create_ca() {
  if [[ -f "${CERT_DIR}/auth-ca.pem" && "${FORCE}" != "--force" ]]; then
    echo "[skip] local CA already exists"
    return
  fi

  openssl req -x509 -newkey rsa:4096 -sha256 -days 3650 -nodes \
    -keyout "${CERT_DIR}/auth-ca.key" \
    -out "${CERT_DIR}/auth-ca.pem" \
    -subj "/CN=Secure Chat Local CA" >/dev/null 2>&1

  chmod 600 "${CERT_DIR}/auth-ca.key"
  chmod 644 "${CERT_DIR}/auth-ca.pem"
  echo "[ok] local CA created"
}

# create_leaf <name> <common-name> <subject-alt-name>
function create_leaf() {
  local name="$1"
  local common_name="$2"
  local san="$3"

  if [[ -f "${CERT_DIR}/${name}.crt" && "${FORCE}" != "--force" ]]; then
    echo "[skip] ${name} certificate already exists"
    return
  fi

  openssl req -newkey rsa:2048 -nodes \
    -keyout "${CERT_DIR}/${name}.key" \
    -out "${CERT_DIR}/${name}.csr" \
    -subj "/CN=${common_name}" >/dev/null 2>&1

  openssl x509 -req \
    -in "${CERT_DIR}/${name}.csr" \
    -CA "${CERT_DIR}/auth-ca.pem" \
    -CAkey "${CERT_DIR}/auth-ca.key" \
    -CAcreateserial \
    -out "${CERT_DIR}/${name}.crt" \
    -days 825 -sha256 \
    -extfile <(printf "subjectAltName=%s\nextendedKeyUsage=serverAuth\n" "${san}") \
    >/dev/null 2>&1

  rm -f "${CERT_DIR}/${name}.csr"
  chmod 600 "${CERT_DIR}/${name}.key"
  chmod 644 "${CERT_DIR}/${name}.crt"
  echo "[ok] ${name} certificate created (${san})"
}

create_ca
create_leaf "auth" "auth" "DNS:auth,DNS:localhost"
create_leaf "edge" "localhost" "DNS:localhost,IP:127.0.0.1"

echo
echo "Certificates live in docker/certs/ (ignored by git)."
echo "Verify with:"
echo "  openssl verify -CAfile docker/certs/auth-ca.pem docker/certs/auth.crt"

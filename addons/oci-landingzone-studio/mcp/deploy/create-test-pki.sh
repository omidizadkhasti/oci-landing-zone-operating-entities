#!/usr/bin/env bash
# Internal pilot PKI only. Prefer organization-managed issuance for production.
set -euo pipefail
umask 077
target="${1:?Pass a private output directory outside Git}"
namespace="${2:-oci-landing-zone}"
[[ "$namespace" =~ ^[a-z0-9-]+$ ]] || exit 1
mkdir -p "$target"
chmod 700 "$target"
[[ ! -e "$target/ca.key" ]] || { echo 'Refusing to overwrite an existing CA.' >&2; exit 1; }
openssl req -x509 -newkey rsa:3072 -nodes -days 365 -sha256 \
  -subj '/CN=Landing Zone MCP Pilot CA' -keyout "$target/ca.key" -out "$target/ca.crt" 2>/dev/null
openssl req -new -newkey rsa:3072 -nodes -subj '/CN=landingzone-mcp' \
  -keyout "$target/tls.key" -out "$target/server.csr" 2>/dev/null
cat > "$target/server.ext" <<EOF
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=DNS:landingzone-mcp,DNS:landingzone-mcp.$namespace,DNS:landingzone-mcp.$namespace.svc,DNS:landingzone-mcp.$namespace.svc.cluster.local,DNS:localhost
EOF
openssl x509 -req -in "$target/server.csr" -CA "$target/ca.crt" -CAkey "$target/ca.key" \
  -CAcreateserial -days 30 -sha256 -extfile "$target/server.ext" -out "$target/tls.crt" 2>/dev/null
for identity in planning unbound; do
  openssl req -new -newkey rsa:3072 -nodes -subj "/CN=landingzone-$identity" \
    -keyout "$target/$identity.key" -out "$target/$identity.csr" 2>/dev/null
  printf '%s\n' 'basicConstraints=critical,CA:FALSE' 'keyUsage=critical,digitalSignature' 'extendedKeyUsage=clientAuth' > "$target/client.ext"
  openssl x509 -req -in "$target/$identity.csr" -CA "$target/ca.crt" -CAkey "$target/ca.key" \
    -CAcreateserial -days 30 -sha256 -extfile "$target/client.ext" -out "$target/$identity.crt" 2>/dev/null
done
fingerprint="$(openssl x509 -in "$target/planning.crt" -noout -fingerprint -sha256 | cut -d= -f2 | tr -d ':' | tr '[:upper:]' '[:lower:]')"
printf '[{"id":"planning","certificateSha256":"%s","projectIds":["planning","smoke-test"]}]\n' "$fingerprint" > "$target/clients.json"
echo 'Pilot PKI created. Keep private keys outside Git; certificates expire in 30 days.'

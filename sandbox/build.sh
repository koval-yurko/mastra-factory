#!/bin/sh
# Builds factory-sandbox:<today>, smoke-tests it, and points FACTORY_SANDBOX_IMAGE in .env at it.
# Run from the repository root via `npm run sandbox:build`; procedure in sandbox/README.md.
set -eu

TAG="factory-sandbox:$(date +%F)"

docker build --platform linux/arm64 -f sandbox/factory-sandbox.Dockerfile -t "$TAG" .
docker run --rm "$TAG" sh -c 'git --version && gh --version'

ARCH=$(docker image inspect --format '{{.Architecture}}' "$TAG")
if [ "$ARCH" != arm64 ]; then
  echo "$TAG is $ARCH, not arm64 — sessions would run under emulation" >&2
  exit 1
fi

if ! grep -q '^FACTORY_SANDBOX_IMAGE=' .env; then
  echo ".env has no FACTORY_SANDBOX_IMAGE= line to update" >&2
  exit 1
fi
sed "s|^FACTORY_SANDBOX_IMAGE=.*|FACTORY_SANDBOX_IMAGE=$TAG|" .env > .env.tmp
mv .env.tmp .env

echo "FACTORY_SANDBOX_IMAGE=$TAG written to .env; restart the server to use it"

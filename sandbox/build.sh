#!/bin/sh
# Builds a sandbox image, smoke-tests it, checks it is arm64, and records the tag.
#
#   npm run sandbox:build                    the base image every session runs on
#   npm run sandbox:build -- owner/name      one project's image, built from the
#                                            Dockerfile beside its sandbox.json
#
# The base image's tag goes to FACTORY_SANDBOX_IMAGE in .env. A project image's tag
# goes to the "image" field of that project's sandbox.json, which IS committed — so
# the tag this deployment runs is recorded in git, not only in a local .env, and a
# rebuild shows up as a reviewable change to that file.
# Run from the repository root; procedure in sandbox/README.md.
set -eu

STAMP="$(date +%F)"
PROJECT="${1:-}"

if [ -z "$PROJECT" ]; then
  DOCKERFILE="sandbox/factory-sandbox.Dockerfile"
  TAG="factory-sandbox:$STAMP"
else
  DOCKERFILE="sandbox/projects/$PROJECT/Dockerfile"
  if [ ! -f "$DOCKERFILE" ]; then
    echo "no $DOCKERFILE, so there is no project image to build for $PROJECT. A project image is built from" >&2
    echo "the Dockerfile beside that project's sandbox.json, under sandbox/projects/<owner>/<name>/, and the" >&2
    echo "argument has to be the repository slug in that same owner/name form (see sandbox/README.md)." >&2
    exit 1
  fi
  # The project half of the slug, which is what its image is named after: the owner
  # is the directory that keeps two same-named repositories apart, and putting it in
  # the tag too would only make the tag longer than the name anyone types.
  TAG="factory-sandbox-${PROJECT#*/}:$STAMP"
fi

docker build --platform linux/arm64 -f "$DOCKERFILE" -t "$TAG" .

# git and the GitHub CLI are what make an image usable for a session at all, so a
# project image is checked for them too — it extends the base image, and this is the
# check that says the extension did not break it. A project's own tools are checked
# by its own Dockerfile, the way the base image's `eas --version` does.
docker run --rm "$TAG" sh -c 'git --version && gh --version'

ARCH=$(docker image inspect --format '{{.Architecture}}' "$TAG")
if [ "$ARCH" != arm64 ]; then
  echo "$TAG is $ARCH, not arm64 — sessions would run under emulation" >&2
  exit 1
fi

if [ -n "$PROJECT" ]; then
  # Written through JSON rather than sed: the file holds more than this one field,
  # and a project's credentials mapping is exactly the part a text edit should not
  # have to be careful around. A sandbox.json this cannot parse fails the build,
  # which is the same fail-closed call the server makes when it reads one.
  node -e '
    const fs = require("node:fs");
    const [file, tag] = process.argv.slice(1);
    const config = JSON.parse(fs.readFileSync(file, "utf8"));
    config.image = tag;
    fs.writeFileSync(file, JSON.stringify(config, null, 2) + "\n");
  ' "sandbox/projects/$PROJECT/sandbox.json" "$TAG"
  echo "$TAG written to sandbox/projects/$PROJECT/sandbox.json; commit it, then restart the server to use it"
  exit 0
fi

if ! grep -q '^FACTORY_SANDBOX_IMAGE=' .env; then
  echo ".env has no FACTORY_SANDBOX_IMAGE= line to update" >&2
  exit 1
fi
sed "s|^FACTORY_SANDBOX_IMAGE=.*|FACTORY_SANDBOX_IMAGE=$TAG|" .env > .env.tmp
mv .env.tmp .env

echo "FACTORY_SANDBOX_IMAGE=$TAG written to .env; restart the server to use it"

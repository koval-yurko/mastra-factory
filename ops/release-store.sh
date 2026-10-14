#!/bin/zsh
# Store a finished build as a release: releases/<UTC-timestamp>-<sha7>/.
#
# Run by the CI "build" job from its own checkout, after `npm run build`:
#   "$REPO_ROOT/ops/release-store.sh" "$GITHUB_SHA"
# The build is read from <cwd>/.mastra/output and copied as an APFS clone
# (`cp -c`), so a 1 GB tree takes seconds and almost no disk. The folder
# appears under its final name only when it is complete.
#
# Prints id=<id>; in GitHub Actions also writes it to $GITHUB_OUTPUT.
# Supervision and file placement only (AGENTS.md, the ops/*.sh carve-out).

set -eu
source "${0:A:h}/release-lib.sh"

(( $# == 1 )) || { print -u2 "usage: ${0:t} <commit sha>"; exit 2; }
readonly SHA=$1
[[ $SHA =~ '^[0-9a-f]{7,40}$' ]] || { print -u2 "[release] not a commit sha: $SHA"; exit 2; }

readonly SOURCE=$PWD/.mastra/output
[[ -f $SOURCE/index.mjs ]] || { print -u2 "[release] no build at $SOURCE — run npm run build first"; exit 1; }

# `npm run build` places the Factory UI and the skill overrides in the output
# (src/build/complete-output.ts). A build without them would serve the repo
# root's UI copy and no override, so refuse it rather than store it.
[[ -f $SOURCE/factory/index.html ]] || { print -u2 "[release] the build has no Factory UI ($SOURCE/factory/index.html) — was it built with npm run build?"; exit 1; }
if [[ -d $PWD/src/mastra/public/factory-skills && ! -d $SOURCE/factory-skills ]]; then
  print -u2 "[release] the build has no factory-skills/ although src/mastra/public/factory-skills exists"
  exit 1
fi

readonly ID="$(date -u +%Y%m%dT%H%M%SZ)-${SHA[1,7]}"
readonly STAGING=$RELEASES_DIR/.staging-$ID
mkdir -p "$RELEASES_DIR/pinned"
rm -rf -- "$STAGING"
mkdir -p "$STAGING"
trap 'rm -rf -- "$STAGING"' EXIT

cp -cR "$SOURCE" "$STAGING/output"

ui_source="mastra@$(jq -r .version node_modules/mastra/package.json)"

lockfile_sha=$(shasum -a 256 package-lock.json | cut -d' ' -f1)
jq -n \
  --arg id "$ID" --arg sha "$SHA" --arg builtAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg runId "${GITHUB_RUN_ID:-}" --arg node "$(node --version)" --arg lock "$lockfile_sha" --arg ui "$ui_source" \
  '{id: $id, sha: $sha, builtAt: $builtAt, runId: ($runId | if . == "" then null else tonumber end),
    node: $node, lockfileSha256: $lock, ui: $ui, activatedAt: null, health: null}' > "$STAGING/release.json"

mv "$STAGING" "$RELEASES_DIR/$ID"
trap - EXIT
record "stored $ID"
print "id=$ID"
[[ -n ${GITHUB_OUTPUT:-} ]] && print "id=$ID" >> "$GITHUB_OUTPUT"
exit 0

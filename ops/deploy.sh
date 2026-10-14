#!/bin/zsh
# Activate a stored release (docs/ci-deploy-research.md, section 6).
#
#   ops/deploy.sh <id>          quiesce, dump, switch, restart, health check
#   ops/deploy.sh --list        releases, with current/previous/pinned marks
#   ops/deploy.sh --pin <id>    keep a release out of pruning
#   ops/deploy.sh --unpin <id>
#
# With releases/HOLD present (local mode) a deploy does nothing and exits 0.
# Supervision only (AGENTS.md, the ops/*.sh carve-out).

set -u
source "${0:A:h}/release-lib.sh"

# Read here, not inside usage(): in a zsh function $0 is the function name.
readonly SCRIPT_NAME=${0:t}
usage() { print -u2 "usage: $SCRIPT_NAME <id> | --list | --pin <id> | --unpin <id>"; exit 2; }

list_releases() {
  local id current previous mark health activated
  current=$(link_target current)
  previous=$(link_target previous)
  for id in $(release_ids); do
    mark='  '
    [[ $id == "$current" ]] && mark='* '
    [[ $id == "$previous" ]] && mark='- '
    health=$(jq -r '.health // "-"' "$RELEASES_DIR/$id/release.json" 2>/dev/null || print '?')
    activated=$(jq -r '.activatedAt // "never"' "$RELEASES_DIR/$id/release.json" 2>/dev/null || print '?')
    print -r -- "$mark$id  health=$health  activated=$activated$([[ -e $RELEASES_DIR/pinned/$id ]] && print '  pinned')$([[ -f $RELEASES_DIR/$id/db.dump ]] && print '  dump')"
  done
  print "(* current, - previous)"
  [[ -e $HOLD_FILE ]] && print "HOLD is set: deploys are paused (ops/local-mode.sh)"
  return 0
}

case ${1:-} in
  --list) list_releases; exit 0 ;;
  --pin|--unpin)
    (( $# == 2 )) || usage
    [[ -d $RELEASES_DIR/$2 ]] || { fail "no release $2"; exit 1; }
    mkdir -p "$RELEASES_DIR/pinned"
    if [[ $1 == --pin ]]; then touch "$RELEASES_DIR/pinned/$2"; else rm -f "$RELEASES_DIR/pinned/$2"; fi
    say "${1#--}ned $2"; exit 0 ;;
  ''|-*) usage ;;
esac

(( $# == 1 )) || usage
readonly ID=$1

if [[ -e $HOLD_FILE ]]; then
  say "held: releases/HOLD exists (local mode). $ID stays stored; run ops/deploy.sh $ID later."
  record "deploy $ID held"
  [[ -n ${GITHUB_STEP_SUMMARY:-} ]] && print "Deploy held (local mode). Release \`$ID\` is stored." >> "$GITHUB_STEP_SUMMARY"
  exit 0
fi

# deploy.sh runs from the repo root checkout, so a pushed change to ops/ or
# actions-runner/ takes effect only after a pull here. Say so when it is behind.
if sha=$(jq -r '.sha // empty' "$RELEASES_DIR/$ID/release.json" 2>/dev/null) && [[ -n $sha ]]; then
  if git -C "$REPO_ROOT" cat-file -e "$sha^{commit}" 2>/dev/null &&
     ! git -C "$REPO_ROOT" diff --quiet HEAD "$sha" -- ops actions-runner 2>/dev/null; then
    say "warning: ops/ or actions-runner/ differ between the repo root and $sha — git pull in $REPO_ROOT"
  fi
fi

activate "$ID" deploy || exit 1
prune_releases
[[ -n ${GITHUB_STEP_SUMMARY:-} ]] && print "Release \`$ID\` is live." >> "$GITHUB_STEP_SUMMARY"
exit 0

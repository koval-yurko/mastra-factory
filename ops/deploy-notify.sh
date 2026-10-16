#!/bin/zsh
# Post the result of a deploy.yml run to Slack, through an incoming webhook.
#
# The notify job of .github/workflows/deploy.yml runs it after every run, with
# the job results and the outcome ops/deploy.sh reported in the environment:
#   IMAGES_RESULT BUILD_RESULT DEPLOY_RESULT   success|failure|cancelled|skipped
#   DEPLOY_OUTCOME DEPLOY_DETAIL               live|held|rolled-back|down|failed
#   RELEASE                                    the release id, when there is one
# The webhook is FACTORY_DEPLOY_SLACK_WEBHOOK_URL in .env; unset, nothing is
# posted. Setup: actions-runner/README.md ("Slack messages").
#
# Supervision only (AGENTS.md, the ops/*.sh carve-out).

set -u
source "${0:A:h}/release-lib.sh"

webhook=$(env_value FACTORY_DEPLOY_SLACK_WEBHOOK_URL)
if [[ -z $webhook ]]; then
  say "FACTORY_DEPLOY_SLACK_WEBHOOK_URL is not set in $REPO_ROOT/.env — no Slack message"
  exit 0
fi

readonly IMAGES=${IMAGES_RESULT:-skipped} BUILD=${BUILD_RESULT:-skipped} DEPLOY=${DEPLOY_RESULT:-skipped}
readonly OUTCOME=${DEPLOY_OUTCOME:-} DETAIL=${DEPLOY_DETAIL:-} RELEASE=${RELEASE:-}

# A manual run that activates a stored release names that release's commit.
sha=
[[ -n $RELEASE ]] && sha=$(jq -r '.sha // empty' "$RELEASES_DIR/$RELEASE/release.json" 2>/dev/null)
[[ -n $sha ]] || sha=$GITHUB_SHA
subject=$(git -C "$REPO_ROOT" log -1 --format=%s "$sha" 2>/dev/null) ||
  subject=$(jq -r '.head_commit.message // "" | split("\n")[0]' "$GITHUB_EVENT_PATH" 2>/dev/null) ||
  subject=

if [[ $IMAGES == (failure|cancelled) ]]; then
  icon=':x:' title='Deploy failed' note="The sandbox image build: $IMAGES. Production is unchanged."
elif [[ $BUILD == (failure|cancelled) ]]; then
  icon=':x:' title='Deploy failed' note="The build: $BUILD. Production is unchanged."
else
  case $OUTCOME in
    live) icon=':white_check_mark:' title='Deployed' note= ;;
    held) icon=':double_vertical_bar:' title='Deploy held'
      note="Local mode (releases/HOLD) is on. Run ops/deploy.sh $RELEASE to activate it." ;;
    rolled-back) icon=':warning:' title='Deploy rolled back'
      note="The new release failed its health check. The previous release is live again: $DETAIL." ;;
    down) icon=':rotating_light:' title='Factory is down'
      note="$DETAIL. See ~/Library/Logs/mastra-factory/err.log." ;;
    failed) icon=':x:' title='Deploy failed' note="$DETAIL. Production is unchanged." ;;
    *) icon=':x:' title='Deploy failed' note="The deploy job: $DEPLOY, before it reported an outcome." ;;
  esac
fi

payload=$(jq -n \
  --arg icon "$icon" --arg title "$title" --arg note "$note" \
  --arg sha "$sha" --arg subject "$subject" --arg release "$RELEASE" \
  --arg commit_url "$GITHUB_SERVER_URL/$GITHUB_REPOSITORY/commit/$sha" \
  --arg run_url "$GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID" \
  --arg now "$EPOCHSECONDS" --arg iso "$(date -u +%Y-%m-%dT%H:%M:%SZ)" '
  def esc: gsub("&"; "&amp;") | gsub("<"; "&lt;") | gsub(">"; "&gt;");
  ($sha[0:7]) as $short |
  {
    text: "\($title): \($short) \($subject)",
    blocks: [{
      type: "section",
      text: {
        type: "mrkdwn",
        text: ([
          "\($icon) *\($title)*  <\($commit_url)|\($short)> \($subject | esc)",
          "<!date^\($now)^{date_short_pretty} {time}|\($iso)> · " +
            (if $release == "" then "" else "release `\($release)` · " end) +
            "<\($run_url)|run log>"
        ] + (if $note == "" then [] else [$note | esc] end) | join("\n"))
      }
    }]
  }')

if print -r -- "$payload" |
   curl -fsS --max-time 20 -X POST -H 'Content-Type: application/json' --data-binary @- "$webhook" >/dev/null; then
  say "posted to Slack: $title"
else
  fail "the Slack webhook did not accept the message"
  exit 1
fi

#!/bin/zsh
# Install and register the GitHub Actions runner for this repository.
#
#   actions-runner/register.sh            download (if missing), register, write the job environment
#   actions-runner/register.sh --replace  register again, e.g. after GitHub removed the runner (14 days offline)
#
# The runner program, its credentials and its work folder go to
# actions-runner/runner/ (gitignored). It is started by the LaunchAgent
# actions-runner/ai.mastra.runner.plist, which ops/install.sh links; this
# script starts nothing. See actions-runner/README.md.
#
# Supervision and file placement only (AGENTS.md, the actions-runner/*.sh carve-out).

set -eu

readonly SCRIPT_DIR="${0:A:h}"
readonly REPO_ROOT="${SCRIPT_DIR:h}"
readonly EXPECTED_ROOT=/Users/koval/dev/test/mastra-factory
readonly RUNNER_DIR=$SCRIPT_DIR/runner
readonly REPO_URL=https://github.com/koval-yurko/mastra-factory
readonly RUNNER_NAME=factory-mac
readonly RUNNER_LABEL=factory-mac

# The plist and the hook path are baked to this root, like every ops/ artifact.
if [[ $REPO_ROOT != "$EXPECTED_ROOT" ]]; then
  print -u2 "[runner] refusing: this checkout is $REPO_ROOT, the plist is baked to $EXPECTED_ROOT"
  exit 1
fi

replace=0
case ${1:-} in
  '') ;;
  --replace) replace=1 ;;
  *) print -u2 "usage: ${0:t} [--replace]"; exit 2 ;;
esac

# The runner must run the exact Node the server runs: ops/factory-start.sh pins it.
readonly NODE_BIN=$(sed -n 's/^readonly NODE_BIN=//p' "$REPO_ROOT/ops/factory-start.sh")
[[ -x $NODE_BIN/node ]] || { print -u2 "[runner] the pinned Node $NODE_BIN/node is missing"; exit 1; }
readonly NODE_VERSION=$("$NODE_BIN/node" --version)

# ---- 1. Download and verify ----------------------------------------------
if [[ ! -x $RUNNER_DIR/config.sh ]]; then
  release=$(curl -fsSL https://api.github.com/repos/actions/runner/releases/latest)
  version=$(print -r -- "$release" | jq -r '.tag_name | ltrimstr("v")')
  expected_sha=$(print -r -- "$release" | jq -r '.body | capture("<!-- BEGIN SHA osx-arm64 -->(?<h>[0-9a-f]{64})<!-- END SHA osx-arm64 -->").h')
  archive=actions-runner-osx-arm64-$version.tar.gz
  [[ -n $version && ${#expected_sha} == 64 ]] || { print -u2 "[runner] could not read the latest release and its SHA-256"; exit 1; }

  mkdir -p "$RUNNER_DIR"
  print "[runner] downloading $archive"
  curl -fL -o "$RUNNER_DIR/$archive" "https://github.com/actions/runner/releases/download/v$version/$archive"
  actual_sha=$(shasum -a 256 "$RUNNER_DIR/$archive" | cut -d' ' -f1)
  if [[ $actual_sha != "$expected_sha" ]]; then
    rm -f "$RUNNER_DIR/$archive"
    print -u2 "[runner] SHA-256 mismatch for $archive: got $actual_sha, release notes say $expected_sha"
    exit 1
  fi
  tar -xzf "$RUNNER_DIR/$archive" -C "$RUNNER_DIR"
  rm -f "$RUNNER_DIR/$archive"
  print "[runner] unpacked runner $version (SHA-256 verified)"
fi

# ---- 2. Register ------------------------------------------------------------
if [[ ! -f $RUNNER_DIR/.runner ]] || (( replace )); then
  print "Registration token: repo Settings > Actions > Runners > New self-hosted runner (valid 1 hour)."
  print -n "Paste the token: "
  read -rs token
  print
  [[ -n $token ]] || { print -u2 "[runner] no token given"; exit 1; }
  (cd "$RUNNER_DIR" && ./config.sh --url "$REPO_URL" --token "$token" \
    --name "$RUNNER_NAME" --labels "$RUNNER_LABEL" --work _work --unattended --replace)
  unset token
else
  print "[runner] already registered as $(jq -r '.agentName // "?"' "$RUNNER_DIR/.runner" 2>/dev/null) (use --replace to register again)"
fi

# config.sh writes .credentials readable by every user; it holds the runner's
# identity. .credentials_rsaparams (its private key) is already 600.
chmod 600 "$RUNNER_DIR"/.credentials(N) "$RUNNER_DIR"/.credentials_rsaparams(N)

# ---- 3. Service entry point -------------------------------------------------
# The plist starts runsvc.sh in the runner root, which is what `svc.sh install`
# would create: a copy of bin/runsvc.sh. Copied on every run, so a runner that
# updated itself gets the current one after `register.sh` runs again.
cp "$RUNNER_DIR/bin/runsvc.sh" "$RUNNER_DIR/runsvc.sh"
chmod u+x "$RUNNER_DIR/runsvc.sh"
print "[runner] placed runsvc.sh"

# The runner is CommonJS Node code living inside this repo, whose package.json
# says "type": "module" — so Node would load bin/RunnerService.js as an ES module
# and the service would die on its first `require`. Node takes the module type
# from the NEAREST package.json, so one here, in the gitignored runner folder,
# stops the search before it reaches the repo root. It is no second package of
# this repo: nothing installs from it and it is not tracked.
print '{ "type": "commonjs" }' > "$RUNNER_DIR/package.json"
print "[runner] placed package.json (type: commonjs)"

# ---- 4. Job environment -----------------------------------------------------
# The runner reads .env and .path in its own folder at start. config.sh writes
# both; replace only the lines this deployment owns.
readonly OWN_KEYS=(REPO_ROOT FACTORY_NODE_VERSION DOCKER_HOST ACTIONS_RUNNER_HOOK_JOB_STARTED)
touch "$RUNNER_DIR/.env"
grep -v -E "^($(IFS='|'; print -r -- "${OWN_KEYS[*]}"))=" "$RUNNER_DIR/.env" > "$RUNNER_DIR/.env.tmp" || true
cat >> "$RUNNER_DIR/.env.tmp" <<ENV
REPO_ROOT=$REPO_ROOT
FACTORY_NODE_VERSION=$NODE_VERSION
DOCKER_HOST=unix://$HOME/.colima/default/docker.sock
ACTIONS_RUNNER_HOOK_JOB_STARTED=$SCRIPT_DIR/hooks/job-started.sh
ENV
mv -f "$RUNNER_DIR/.env.tmp" "$RUNNER_DIR/.env"
print -r -- "$NODE_BIN:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin" > "$RUNNER_DIR/.path"
print "[runner] wrote $RUNNER_DIR/.env and .path (Node $NODE_VERSION)"

print "[runner] done. Next: ops/install.sh, then bootstrap ai.mastra.runner (actions-runner/README.md). Nothing was started."

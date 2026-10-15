# Session image for koval-yurko/eleven-labs-english-agent. Written from scratch,
# not FROM the shared image, so it carries only what this repository uses.
#
# Every project image keeps the session contract itself; the image pipeline
# checks it on the finished image (sandbox/README.md):
#   * git and gh — the Factory clones with one and opens pull requests with the other;
#   * node, npm and corepack — corepack lets a checkout pick its package manager;
#   * WORKDIR /workspace — the clone path the runtime addresses;
#   * a long-lived CMD — the runtime passes no command.
# The build context is this folder only. Credentials never go in here: they reach
# the container from SSM at creation (the "secrets" list in sandbox.json).
FROM node:22-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392

RUN apt-get update && apt-get install -y --no-install-recommends \
      git ca-certificates curl gnupg openssh-client less \
 && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
 && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list \
 && apt-get update && apt-get install -y --no-install-recommends gh \
 && rm -rf /var/lib/apt/lists/*

RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential python3 python3-pip python3-venv ripgrep jq unzip \
 && rm -rf /var/lib/apt/lists/*
RUN corepack enable

# EAS CLI (https://docs.expo.dev/eas/cli/) — pinned; bump the version to upgrade.
# Logs in with EXPO_TOKEN.
RUN npm install -g eas-cli@24.10.0 && npm cache clean --force && eas --version

# Vercel CLI — pinned; bump the version to upgrade. Logs in with VERCEL_TOKEN and
# takes the team from VERCEL_ORG_ID. The container never holds VERCEL_PROJECT_ID,
# because it would pin the CLI to one project; a command sets it for the project it
# needs (the vercel-cli skill).
RUN npm install -g vercel@63.1.2 && npm cache clean --force && vercel --version

WORKDIR /workspace
CMD ["sleep", "infinity"]

# Session image for the koval-yurko/eleven-labs-english-agent repository.
#
# DEFINED FROM SCRATCH, not built on sandbox/factory-sandbox.Dockerfile. A project
# image carries only what this repository's sessions actually use, so the shared
# image's Expo/EAS toolchain stays out of it — nothing here builds through Expo,
# and a CLI an agent never runs is still a CLI an agent can run, plus ~200 MB of
# image and a version to keep patched. The trade is that the session contract
# below is this file's own responsibility rather than something it picks up: a
# project image that forgets a line here does not inherit it from anywhere.
#
# THE SESSION CONTRACT, which every project image carries itself:
#   * git and the GitHub CLI — the Factory clones with one and opens pull
#     requests with the other, and sandbox/build.sh smoke-tests both in the
#     finished image before it will record a tag.
#   * node, npm and corepack — this repository is TypeScript, and corepack is
#     what lets a checkout pick its own package manager.
#   * WORKDIR /workspace — the clone path. It agrees with
#     MASTRACODE_SANDBOX_WORKDIR and with the base image's own WORKDIR; guard 46
#     pins those and the per-project gate pins this one, because the runtime
#     addresses /workspace and an image built to a different path lands every
#     session in an empty directory without failing.
#   * CMD sleep infinity — the container has to stay up on its own. The runtime
#     passes no command, so an image with nothing to run exits immediately and
#     the session dies before the agent types anything.
#
# Build it with `npm run sandbox:build -- koval-yurko/eleven-labs-english-agent`,
# which smoke-tests it, checks its architecture, and writes the resulting tag into
# the sandbox.json beside this file. Procedure in sandbox/README.md.
FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      git ca-certificates curl gnupg openssh-client less \
 && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
 && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list \
 && apt-get update && apt-get install -y --no-install-recommends gh \
 && rm -rf /var/lib/apt/lists/*

# Build and inspection tools this repository's sessions reach for: native npm
# modules need build-essential and python3, and reading a tree needs ripgrep.
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential python3 python3-pip python3-venv ripgrep jq unzip \
 && rm -rf /var/lib/apt/lists/*
RUN corepack enable

# Vercel CLI — pinned; bump the version and rebuild to upgrade.
#
# This repository deploys services/api to Vercel, and its agents need to read deploy
# status, build failures and recent runtime logs. Having the CLI in the image is what
# stops the workaround koval-yurko/eleven-labs-english-agent#3 reports — `npx --yes
# vercel@latest` in scripts/env-sync.mjs, roughly 59 MB fetched per call and a moving
# version — from being the only way to reach that data from a session. Read-only use
# only; the commands that are and are not allowed are the target repository's to say.
RUN npm install -g vercel@63.1.2 && npm cache clean --force && vercel --version

WORKDIR /workspace
CMD ["sleep", "infinity"]

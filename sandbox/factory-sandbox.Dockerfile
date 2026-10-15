# The shared session image: every repository without its own image under
# sandbox/projects/ runs on this one. Pinned by digest, so the tag computed from
# this file names exactly one image; change the digest to take a base update.
FROM node:22-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392

RUN apt-get update && apt-get install -y --no-install-recommends \
      git ca-certificates curl gnupg openssh-client less \
 && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
 && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list \
 && apt-get update && apt-get install -y --no-install-recommends gh \
 && rm -rf /var/lib/apt/lists/*

# generic toolchain — no specific target repo yet
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential python3 python3-pip python3-venv ripgrep jq unzip \
 && rm -rf /var/lib/apt/lists/*
RUN corepack enable

WORKDIR /workspace
CMD ["sleep", "infinity"]

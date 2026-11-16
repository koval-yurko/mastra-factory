# Session image for koval-yurko/high-load-test. Written from scratch, not FROM the
# shared image, so it carries only what this repository uses: Terraform, the AWS
# CLI, k6, jq and direnv (its scripts/01-install-tools.sh list, without Docker:
# images are built outside the sandbox).
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
      ripgrep jq unzip \
 && rm -rf /var/lib/apt/lists/*
RUN corepack enable

# Each tool is pinned; bump the version to upgrade. Terraform must match the
# repository's `required_version = "~> 1.14.0"`.
ARG TERRAFORM_VERSION=1.14.9
ARG AWSCLI_VERSION=2.40.3
ARG K6_VERSION=2.4.0
ARG DIRENV_VERSION=2.38.2
RUN set -eux; cd /tmp \
 && curl -fsSLo terraform.zip "https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION}/terraform_${TERRAFORM_VERSION}_linux_arm64.zip" \
 && unzip -q terraform.zip terraform -d /usr/local/bin \
 && curl -fsSLo awscli.zip "https://awscli.amazonaws.com/awscli-exe-linux-aarch64-${AWSCLI_VERSION}.zip" \
 && unzip -q awscli.zip && ./aws/install \
 && curl -fsSL "https://github.com/grafana/k6/releases/download/v${K6_VERSION}/k6-v${K6_VERSION}-linux-arm64.tar.gz" \
      | tar -xz --strip-components=1 -C /usr/local/bin "k6-v${K6_VERSION}-linux-arm64/k6" \
 && curl -fsSLo /usr/local/bin/direnv "https://github.com/direnv/direnv/releases/download/v${DIRENV_VERSION}/direnv.linux-arm64" \
 && chmod +x /usr/local/bin/direnv \
 && rm -rf /tmp/* \
 && terraform version && aws --version && k6 version && direnv --version

# The repository's .envrc derives TFE_TOKEN, TF_VAR_* and K6_CLOUD_STACK_ID from
# the secrets. /bin/sh becomes a shim that loads it for every command (direnv-sh).
# Last, so no RUN above runs through the shim.
COPY direnv.toml /root/.config/direnv/direnv.toml
COPY direnv-sh /usr/local/bin/direnv-sh
RUN chmod 755 /usr/local/bin/direnv-sh && ln -sf /usr/local/bin/direnv-sh /usr/bin/sh

WORKDIR /workspace
CMD ["sleep", "infinity"]

# Session image for koval-yurko/custom-models-inference (Terraform on HCP + GCP).
# Written from scratch, not FROM the shared image; the session contract is in
# sandbox/README.md. Credentials never go in here: they reach the container
# from SSM at creation (the "secrets" list in sandbox.json).
FROM node:22-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392

RUN apt-get update && apt-get install -y --no-install-recommends \
      git ca-certificates curl gnupg openssh-client less \
 && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
 && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list \
 && apt-get update && apt-get install -y --no-install-recommends gh \
 && rm -rf /var/lib/apt/lists/*

# python3: the repo's scripts/ (standard library only). direnv: the repo runs
# raw terraform and gcloud as `direnv exec . <cmd>` so .envrc maps the values.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 ripgrep jq unzip direnv \
 && rm -rf /var/lib/apt/lists/*
RUN corepack enable

# Terraform and tflint — pinned with their release checksums; bump both to upgrade.
RUN curl -fsSLo /tmp/tf.zip https://releases.hashicorp.com/terraform/1.17.2/terraform_1.17.2_linux_arm64.zip \
 && echo "858e08c181a76b6b223e8c767a8e983922eebe2d062db949a2de66ce040c368c  /tmp/tf.zip" | sha256sum -c - \
 && curl -fsSLo /tmp/tflint.zip https://github.com/terraform-linters/tflint/releases/download/v0.66.0/tflint_linux_arm64.zip \
 && echo "1105a0a5ddee7cdac7957a3475571a946b839192ea1bc0c722c6c4686001067e  /tmp/tflint.zip" | sha256sum -c - \
 && unzip -o /tmp/tf.zip terraform -d /usr/local/bin && unzip -o /tmp/tflint.zip tflint -d /usr/local/bin \
 && rm /tmp/tf.zip /tmp/tflint.zip && terraform version && tflint --version

# Google Cloud CLI — pinned; bump the version to upgrade.
RUN curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg \
      | gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg \
 && echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" \
      > /etc/apt/sources.list.d/google-cloud-sdk.list \
 && apt-get update && apt-get install -y --no-install-recommends google-cloud-cli=593.0.0-0 \
 && rm -rf /var/lib/apt/lists/* && gcloud --version

# The repo expects GOOGLE_APPLICATION_CREDENTIALS to be a key file path, but SSM
# gives the key JSON as GOOGLE_CREDENTIALS. The ENTRYPOINT writes it to that path
# at every container start: Factory (@mastra/docker) replaces CMD with its own
# command but keeps the image ENTRYPOINT. Then it hands over to the node image's
# entrypoint.
ENV GOOGLE_APPLICATION_CREDENTIALS=/root/.gcp/key.json

WORKDIR /workspace
ENTRYPOINT ["sh", "-c", "umask 077 && mkdir -p /root/.gcp && printf '%s' \"${GOOGLE_CREDENTIALS:-}\" > /root/.gcp/key.json && exec docker-entrypoint.sh \"$@\"", "sh"]
CMD ["sleep", "infinity"]

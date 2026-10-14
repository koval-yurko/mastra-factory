/**
 * The deployment's configuration: the ONE first-party module that reads
 * `process.env` for a configuration key. Every other config module reads the
 * exported `env` object (and, by importing this module, waits for the boot load
 * below).
 *
 * At boot:
 *   1. When `FACTORY_SSM_PARAMETER_PATH` is set, every parameter under that path
 *      is loaded from AWS SSM Parameter Store as the initial values.
 *   2. `.env` and the shell override them: a non-blank value in `process.env`
 *      wins (dotenv `populate(…, { override: false })`). `process.env` itself is
 *      never written.
 *   3. envalid validates the result against `envSpecs` and stops the boot on a
 *      bad value, naming the key but never a secret value.
 *
 * Keys come in two groups, in the same order as `.env.example`:
 *   - SYSTEM keys stay in `.env`: dependencies, Docker Compose or the deployer
 *     read many of them straight from `process.env`, so a value only in AWS
 *     would never reach them.
 *   - ADDITIONAL keys are secrets and app credentials only our config reads;
 *     they belong in Parameter Store.
 *
 * `env` is a live view: each read re-merges the sources, so tests that stub
 * `process.env` per case see their stub. In a running server nothing changes
 * after boot, so every read returns the validated value.
 */
import { SSMClient } from '@aws-sdk/client-ssm';
import { populate } from 'dotenv';
import { EnvMissingError, cleanEnv, makeValidator, str, url, type ReporterOptions } from 'envalid';
import { loadParameters, type ParameterStore } from '../secrets/parameter-store';

/** A string that must match `pattern` in full. */
const matching = (pattern: RegExp, description: string) =>
  makeValidator<string>(input => {
    if (!pattern.test(input)) throw new Error(`must be ${description}`);
    return input;
  });

const optional = str({ default: undefined });
const optionalUrl = url({ default: undefined });

/** Required when the named key holds a value. */
const requiredWith = (other: string) => ({
  default: undefined,
  requiredWhen: (cleaned: Record<string, unknown>) => cleaned[other] !== undefined,
});

/** The value of an unset or blank key. */
const DEFAULTS = {
  MASTRACODE_SANDBOX_WORKDIR: '/workspace',
  FACTORY_CREDENTIAL_ENCRYPTION_KEY_ID: 'v1',
} as const;

/** Where Parameter Store is. Read from `process.env` only; a parameter with one of these names is ignored. */
const bootstrapSpecs = {
  FACTORY_SSM_PARAMETER_PATH: matching(/^\/\S*$/, 'a parameter path starting with "/"')({ default: undefined }),
  AWS_SECRETS_MANAGER_REGION: str(requiredWith('FACTORY_SSM_PARAMETER_PATH')),
  AWS_SECRETS_MANAGER_ACCESS_KEY_ID: str(requiredWith('AWS_SECRETS_MANAGER_SECRET_ACCESS_KEY')),
  AWS_SECRETS_MANAGER_SECRET_ACCESS_KEY: str(requiredWith('AWS_SECRETS_MANAGER_ACCESS_KEY_ID')),
};

/** SYSTEM keys: keep them in `.env`. */
const systemSpecs = {
  ...bootstrapSpecs,

  // Server (ops/README.md). The deployer and dockerode read these themselves.
  MASTRA_HOST: optional,
  PORT: optional,
  NODE_ENV: optional,
  DOCKER_HOST: optional,

  // Origins. `@mastra/factory` also reads these from `process.env`.
  MASTRACODE_PUBLIC_URL: optionalUrl,
  MASTRACODE_CHANNELS_PUBLIC_URL: optionalUrl,
  MASTRACODE_ALLOWED_ORIGINS: optional,

  // Database. Docker Compose reads the POSTGRES_* keys from `.env`.
  DATABASE_URL: optional,
  POSTGRES_USER: optional,
  POSTGRES_PASSWORD: optional,
  POSTGRES_DB: optional,

  // Sandbox (sandbox/README.md).
  FACTORY_SANDBOX_PROVIDER: optional,
  FACTORY_SANDBOX_IMAGE: matching(
    /^factory-sandbox:[0-9]{4}-[0-9]{2}-[0-9]{2}[A-Za-z0-9._-]*$/,
    'a date-tagged image, factory-sandbox:YYYY-MM-DD',
  )({ default: undefined }),
  FACTORY_SANDBOX_MEMORY_GIB: optional,
  FACTORY_SANDBOX_CPUS: optional,
  MASTRACODE_SANDBOX_WORKDIR: str({ default: DEFAULTS.MASTRACODE_SANDBOX_WORKDIR }),
  MASTRACODE_LOCAL_SANDBOX_ROOT: optional,
  MASTRACODE_MAX_SANDBOXES: matching(/^[0-9]+$/, 'a whole number')({ default: undefined }),
  MASTRACODE_DISPATCH_MAX_IN_FLIGHT: optional,

  // GitHub bots allowed to trigger work, besides this deployment's own App.
  MASTRACODE_GITHUB_AUTHORIZED_BOTS: optional,

  // Studio (patched @mastra/server and @mastra/code-sdk).
  MASTRA_STUDIO_USER_ID: optional,
  MASTRA_STUDIO_USER_EMAIL: optional,
  MASTRA_STUDIO_USER_NAME: optional,
  MASTRA_STUDIO_FALLBACK_MODEL: optional,

  // Model providers, read by `@mastra/core` and `@mastra/code-sdk`.
  ANTHROPIC_API_KEY: optional,
  OPENAI_API_KEY: optional,

  // Second link of the OAuth `state` signer chain (`./integrations`).
  WORKOS_COOKIE_PASSWORD: optional,

  // Factory login the deploy scripts sign in with (`ops/deploy.sh`). Only those
  // scripts read them, from `.env`; the server never does.
  FACTORY_DEPLOY_EMAIL: optional,
  FACTORY_DEPLOY_PASSWORD: optional,

  // Keep UNSET (AGENTS.md): each one hands this deployment back to Mastra's
  // platform, a cloud sandbox, or no authentication.
  MASTRACODE_AUTH_DISABLED: optional,
  MASTRA_SHARED_API_URL: optionalUrl,
  MASTRA_PLATFORM_ACCESS_TOKEN: optional,
  MASTRA_PLATFORM_SECRET_KEY: optional,
  MASTRA_PROJECT_ID: optional,
  MASTRA_ENVIRONMENT_ID: optional,
  E2B_API_KEY: optional,
};

/**
 * ADDITIONAL keys: keep them in Parameter Store, out of `.env`. An incomplete
 * app group is not an error (NFR23): `./integrations` leaves that app off.
 */
const additionalSpecs = {
  BETTER_AUTH_SECRET: optional,
  FACTORY_CREDENTIAL_ENCRYPTION_KEY: optional,
  FACTORY_CREDENTIAL_ENCRYPTION_KEY_ID: str({ default: DEFAULTS.FACTORY_CREDENTIAL_ENCRYPTION_KEY_ID }),
  FACTORY_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS: optional,

  GITHUB_APP_ID: optional,
  GITHUB_APP_PRIVATE_KEY: optional,
  GITHUB_APP_CLIENT_ID: optional,
  GITHUB_APP_CLIENT_SECRET: optional,
  GITHUB_APP_SLUG: optional,
  GITHUB_APP_WEBHOOK_SECRET: optional,

  LINEAR_CLIENT_ID: optional,
  LINEAR_CLIENT_SECRET: optional,

  SLACK_APP_SIGNING_SECRET: optional,
  SLACK_APP_BOT_TOKEN: optional,
  SLACK_APP_CLIENT_ID: optional,
  SLACK_APP_CLIENT_SECRET: optional,

  EXPO_TOKEN: optional,
};

export const envSpecs = { ...systemSpecs, ...additionalSpecs };
export type EnvKey = keyof typeof envSpecs;

export const SYSTEM_KEYS: ReadonlySet<string> = new Set(Object.keys(systemSpecs));
export const ADDITIONAL_KEYS: ReadonlySet<string> = new Set(Object.keys(additionalSpecs));

/** Keys whose values are secrets: never printed, and masked by `../logger`. */
export const SENSITIVE_KEYS: ReadonlySet<EnvKey> = new Set<EnvKey>([
  'AWS_SECRETS_MANAGER_SECRET_ACCESS_KEY',
  'DATABASE_URL',
  'POSTGRES_PASSWORD',
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'WORKOS_COOKIE_PASSWORD',
  'FACTORY_DEPLOY_PASSWORD',
  'MASTRA_PLATFORM_ACCESS_TOKEN',
  'MASTRA_PLATFORM_SECRET_KEY',
  'E2B_API_KEY',
  'BETTER_AUTH_SECRET',
  'FACTORY_CREDENTIAL_ENCRYPTION_KEY',
  'FACTORY_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS',
  'GITHUB_APP_PRIVATE_KEY',
  'GITHUB_APP_CLIENT_SECRET',
  'GITHUB_APP_WEBHOOK_SECRET',
  'LINEAR_CLIENT_SECRET',
  'SLACK_APP_SIGNING_SECRET',
  'SLACK_APP_BOT_TOKEN',
  'SLACK_APP_CLIENT_SECRET',
  'EXPO_TOKEN',
]);

/**
 * Throws instead of envalid's default print-and-exit. A validator's message is
 * shown only for keys that are not secrets, because some messages quote the value.
 */
function reporter({ errors }: ReporterOptions<Record<string, unknown>>): void {
  const problems = Object.entries(errors).map(([key, error]) => {
    if (error instanceof EnvMissingError) return `${key} is required`;
    if (SENSITIVE_KEYS.has(key as EnvKey)) return `${key} is invalid`;
    return `${key} is invalid: ${error?.message ?? 'rejected'}`;
  });
  if (problems.length > 0) {
    throw new Error(`Invalid environment (see .env.example): ${problems.join('; ')}.`);
  }
}

/** Blank and whitespace-only values count as unset. */
function withoutBlanks(source: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(source).filter((entry): entry is [string, string] => Boolean(entry[1]?.trim())),
  );
}

const bootstrap = cleanEnv(withoutBlanks(process.env), bootstrapSpecs, { reporter });

/** The configured store (prefix without a trailing `/`, and one client), shared with the `parameter_store` tool. */
export const parameterStore: ParameterStore | undefined = bootstrap.FACTORY_SSM_PARAMETER_PATH
  ? {
      prefix: bootstrap.FACTORY_SSM_PARAMETER_PATH.replace(/\/+$/, '') || '/',
      client: new SSMClient({
        region: bootstrap.AWS_SECRETS_MANAGER_REGION,
        // Unset → the SDK's default credential chain.
        credentials:
          bootstrap.AWS_SECRETS_MANAGER_ACCESS_KEY_ID && bootstrap.AWS_SECRETS_MANAGER_SECRET_ACCESS_KEY
            ? {
                accessKeyId: bootstrap.AWS_SECRETS_MANAGER_ACCESS_KEY_ID,
                secretAccessKey: bootstrap.AWS_SECRETS_MANAGER_SECRET_ACCESS_KEY,
              }
            : undefined,
      }),
    }
  : undefined;

async function loadFromParameterStore(store: ParameterStore | undefined): Promise<Record<string, string>> {
  if (!store) return {};
  let loaded: Record<string, string>;
  try {
    loaded = await loadParameters(store.client, store.prefix);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Loading environment values from AWS SSM Parameter Store under ${store.prefix} failed: ${reason}`, {
      cause: error,
    });
  }
  for (const key of Object.keys(bootstrapSpecs)) delete loaded[key];
  console.log(`[env] loaded ${Object.keys(loaded).length} value(s) from AWS SSM Parameter Store under ${store.prefix}.`);
  return loaded;
}

const parameters = await loadFromParameterStore(parameterStore);

/** Whether `.env` or the shell holds a non-blank value for `key`, which then wins over Parameter Store. */
export function isSetLocally(key: string): boolean {
  return Boolean(process.env[key]?.trim());
}

/** `process.env` over the parameters: a parameter fills only a key `.env` leaves unset or blank. */
function readMerged(): Record<string, string | undefined> {
  const merged: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!(key in parameters) || isSetLocally(key)) merged[key] = value;
  }
  populate(merged as Record<string, string>, parameters, { override: false });
  return merged;
}

const shadowed = Object.keys(parameters).filter(isSetLocally).sort();
if (shadowed.length > 0) {
  console.log(`[env] .env overrides Parameter Store for: ${shadowed.join(', ')}.`);
}

cleanEnv(withoutBlanks(readMerged()), envSpecs, { reporter });

function read(key: EnvKey): string | undefined {
  const value = readMerged()[key];
  if (key in DEFAULTS && !value?.trim()) return DEFAULTS[key as keyof typeof DEFAULTS];
  return value;
}

type EnvView = { readonly [K in EnvKey]: K extends keyof typeof DEFAULTS ? string : string | undefined };

/** The validated configuration: raw strings (consumers keep their own parsing); defaults for blank keys in `DEFAULTS`. */
export const env: EnvView = Object.freeze(
  Object.defineProperties(
    {},
    Object.fromEntries(
      Object.keys(envSpecs).map(key => [key, { enumerable: true, get: () => read(key as EnvKey) }]),
    ),
  ),
) as EnvView;

/** `[key, value]` for every sensitive key that holds a value now; what `../logger` masks. */
export function secretValues(): [EnvKey, string][] {
  const merged = readMerged();
  return [...SENSITIVE_KEYS].flatMap(key => {
    const value = merged[key]?.trim();
    return value ? [[key, value] as [EnvKey, string]] : [];
  });
}

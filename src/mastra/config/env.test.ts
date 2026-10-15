/**
 * `./env`: the Parameter Store merge, defaults, the live view, validation
 * failures, and which values count as secrets. `loadParameters` is mocked, so
 * no case reaches AWS. Each case stubs every known key (unset unless the case
 * sets it) and re-imports the module, because the load and the validation run
 * at module load.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadParameters, loadProjectParameters } from '../secrets/parameter-store';

vi.mock('../secrets/parameter-store', async importOriginal => ({
  ...(await importOriginal<typeof import('../secrets/parameter-store')>()),
  loadParameters: vi.fn(async () => ({})),
  loadProjectParameters: vi.fn(async () => ({})),
}));

// Imported once for the key list only; `loadParameters` is already mocked.
const { ADDITIONAL_KEYS, SYSTEM_KEYS, envSpecs } = await import('./env');

async function load(values: Record<string, string>) {
  for (const key of Object.keys(envSpecs)) vi.stubEnv(key, values[key]);
  vi.resetModules();
  return import('./env');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.mocked(loadParameters).mockReset().mockResolvedValue({});
  vi.mocked(loadProjectParameters).mockReset().mockResolvedValue({});
  vi.restoreAllMocks();
});

describe('without FACTORY_SSM_PARAMETER_PATH', () => {
  it('makes no AWS call and reads process.env', async () => {
    const { env } = await load({ MASTRA_HOST: '127.0.0.1' });

    expect(loadParameters).not.toHaveBeenCalled();
    expect(env.MASTRA_HOST).toBe('127.0.0.1');
  });

  it('applies a default to an unset or blank key', async () => {
    expect((await load({})).env.FACTORY_CREDENTIAL_ENCRYPTION_KEY_ID).toBe('v1');
    expect((await load({ MASTRACODE_SANDBOX_WORKDIR: '  ' })).env.MASTRACODE_SANDBOX_WORKDIR).toBe('/workspace');
    expect((await load({ FACTORY_CREDENTIAL_ENCRYPTION_KEY_ID: 'v2' })).env.FACTORY_CREDENTIAL_ENCRYPTION_KEY_ID).toBe('v2');
  });

  it('is a live view: a later process.env change is visible', async () => {
    const { env } = await load({});
    vi.stubEnv('SLACK_APP_BOT_TOKEN', 'bot-later');

    expect(env.SLACK_APP_BOT_TOKEN).toBe('bot-later');
  });

  it('keeps a present-but-empty value as the empty string', async () => {
    // `./integrations` relies on this for MASTRACODE_CHANNELS_PUBLIC_URL.
    expect((await load({ MASTRACODE_CHANNELS_PUBLIC_URL: '' })).env.MASTRACODE_CHANNELS_PUBLIC_URL).toBe('');
  });
});

describe('with FACTORY_SSM_PARAMETER_PATH', () => {
  const AWS = {
    FACTORY_SSM_PARAMETER_PATH: '/mastra-factory',
    AWS_SECRETS_MANAGER_REGION: 'eu-central-1',
    AWS_SECRETS_MANAGER_ACCESS_KEY_ID: 'test-access-key-id',
    AWS_SECRETS_MANAGER_SECRET_ACCESS_KEY: 'test-secret-access-key',
  };

  it('loads the prefix as initial values, without writing process.env', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.mocked(loadParameters).mockResolvedValue({ SLACK_APP_BOT_TOKEN: 'bot-ssm' });

    const { env } = await load(AWS);

    expect(vi.mocked(loadParameters).mock.calls[0]![1]).toBe('/mastra-factory');
    expect(env.SLACK_APP_BOT_TOKEN).toBe('bot-ssm');
    expect(process.env.SLACK_APP_BOT_TOKEN).toBeUndefined();
  });

  it('lets a value from .env win over the parameter, and names the key once at boot', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.mocked(loadParameters).mockResolvedValue({ DATABASE_URL: 'postgres://from-ssm', SLACK_APP_BOT_TOKEN: 'bot-ssm' });

    const { env, isSetLocally } = await load({ ...AWS, DATABASE_URL: 'postgres://from-dotenv' });

    expect(env.DATABASE_URL).toBe('postgres://from-dotenv');
    expect(env.SLACK_APP_BOT_TOKEN).toBe('bot-ssm');
    expect(isSetLocally('DATABASE_URL')).toBe(true);
    expect(log).toHaveBeenCalledWith('[env] .env overrides Parameter Store for: DATABASE_URL.');
    expect(log.mock.calls.flat().join(' ')).not.toContain('from-dotenv');
  });

  it('does not let a blank .env line hide the parameter', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.mocked(loadParameters).mockResolvedValue({ BETTER_AUTH_SECRET: 'auth-from-ssm' });

    const { env, isSetLocally } = await load({ ...AWS, BETTER_AUTH_SECRET: '  ' });

    expect(env.BETTER_AUTH_SECRET).toBe('auth-from-ssm');
    expect(isSetLocally('BETTER_AUTH_SECRET')).toBe(false);
  });

  it('ignores a parameter named like a bootstrap key', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.mocked(loadParameters).mockResolvedValue({ AWS_SECRETS_MANAGER_REGION: 'us-east-1' });

    expect((await load(AWS)).env.AWS_SECRETS_MANAGER_REGION).toBe('eu-central-1');
  });

  it('stops the boot when the load fails, naming the prefix', async () => {
    vi.mocked(loadParameters).mockRejectedValue(new Error('The security token included in the request is invalid.'));

    await expect(load(AWS)).rejects.toThrow(
      'Loading environment values from AWS SSM Parameter Store under /mastra-factory failed: ' +
        'The security token included in the request is invalid.',
    );
  });

  it('requires AWS_SECRETS_MANAGER_REGION', async () => {
    await expect(load({ FACTORY_SSM_PARAMETER_PATH: '/mastra-factory' })).rejects.toThrow('AWS_SECRETS_MANAGER_REGION is required');
    expect(loadParameters).not.toHaveBeenCalled();
  });

  it('requires both halves of an access key', async () => {
    const { AWS_SECRETS_MANAGER_SECRET_ACCESS_KEY: _omitted, ...withoutSecret } = AWS;
    await expect(load(withoutSecret)).rejects.toThrow('AWS_SECRETS_MANAGER_SECRET_ACCESS_KEY is required');
  });
});

describe('validation', () => {
  it('names the key and the reason for a value that is not a secret', async () => {
    await expect(load({ MASTRACODE_PUBLIC_URL: 'not a url' })).rejects.toThrow(/MASTRACODE_PUBLIC_URL is invalid: /);
    await expect(load({ MASTRACODE_MAX_SANDBOXES: 'three' })).rejects.toThrow(
      'MASTRACODE_MAX_SANDBOXES is invalid: must be a whole number',
    );
  });

  it('validates a value that came from Parameter Store', async () => {
    vi.mocked(loadParameters).mockResolvedValue({ MASTRACODE_MAX_SANDBOXES: 'three' });

    await expect(
      load({ FACTORY_SSM_PARAMETER_PATH: '/mastra-factory', AWS_SECRETS_MANAGER_REGION: 'eu-central-1' }),
    ).rejects.toThrow('MASTRACODE_MAX_SANDBOXES is invalid: must be a whole number');
  });

  it('accepts blank values for validated keys', async () => {
    await expect(load({ MASTRACODE_PUBLIC_URL: '', MASTRACODE_MAX_SANDBOXES: '  ' })).resolves.toBeDefined();
  });
});

describe('project secrets', () => {
  const AWS = { FACTORY_SSM_PARAMETER_PATH: '/mastra-factory', AWS_SECRETS_MANAGER_REGION: 'eu-central-1' };

  it('loads the projects/ subtree into its own map, not into env keys', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.mocked(loadProjectParameters).mockResolvedValue({ 'owner/app': { VERCEL_TOKEN: 'vercel-secret' } });

    const { env, projectSecrets, projectSecretName } = await load(AWS);

    expect(vi.mocked(loadProjectParameters).mock.calls[0]![1]).toBe('/mastra-factory');
    expect(projectSecrets('owner/app')).toEqual({ VERCEL_TOKEN: 'vercel-secret' });
    expect(projectSecrets('owner/other')).toEqual({});
    expect(projectSecretName('owner/app', 'VERCEL_TOKEN')).toBe('/mastra-factory/projects/owner/app/VERCEL_TOKEN');
    expect(env).not.toHaveProperty('VERCEL_TOKEN');
  });

  it('has none, and no parameter name, without Parameter Store', async () => {
    const { projectSecrets, projectSecretName } = await load({});

    expect(loadProjectParameters).not.toHaveBeenCalled();
    expect(projectSecrets('owner/app')).toEqual({});
    expect(projectSecretName('owner/app', 'VERCEL_TOKEN')).toBeUndefined();
  });

  it('are masked like sensitive keys, labelled by project', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.mocked(loadProjectParameters).mockResolvedValue({ 'owner/app': { VERCEL_TOKEN: ' vercel-secret ' } });

    const { secretValues } = await load(AWS);

    expect(secretValues()).toContainEqual(['owner/app/VERCEL_TOKEN', 'vercel-secret']);
  });
});

describe('secretValues', () => {
  it('lists only sensitive keys that hold a value', async () => {
    const { secretValues } = await load({ BETTER_AUTH_SECRET: ' auth-secret ', MASTRA_HOST: '127.0.0.1' });

    expect(secretValues()).toEqual([['BETTER_AUTH_SECRET', 'auth-secret']]);
  });
});

describe('key groups', () => {
  it('puts every key in exactly one group', () => {
    const keys = Object.keys(envSpecs);
    expect(keys.filter(key => SYSTEM_KEYS.has(key) === ADDITIONAL_KEYS.has(key))).toEqual([]);
    expect(SYSTEM_KEYS.size + ADDITIONAL_KEYS.size).toBe(keys.length);
  });

  it('keeps the bootstrap keys and the dependency-read keys in the system group', () => {
    for (const key of ['FACTORY_SSM_PARAMETER_PATH', 'AWS_SECRETS_MANAGER_REGION', 'MASTRA_HOST', 'ANTHROPIC_API_KEY', 'POSTGRES_PASSWORD']) {
      expect(SYSTEM_KEYS.has(key)).toBe(true);
    }
  });
});

/**
 * The `parameter_store` definition and its registration. The logic is mocked
 * for the definition cases: what is asserted is the call mapping and that a
 * failure becomes an `{ error }` result rather than a thrown run. Registration
 * is checked by loading `../index` with and without a prefix, with the boot
 * load mocked so no case reaches AWS.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ParameterStore } from '../../secrets/parameter-store';
import { createParameterStoreTool } from './definition';
import { InvalidRequestError, runParameterStoreAction } from './logic';

vi.mock('./logic', async importOriginal => ({
  ...(await importOriginal<typeof import('./logic')>()),
  runParameterStoreAction: vi.fn(),
}));

vi.mock('../../secrets/parameter-store', async importOriginal => ({
  ...(await importOriginal<typeof import('../../secrets/parameter-store')>()),
  loadParameters: vi.fn(async () => ({})),
  loadProjectParameters: vi.fn(async () => ({})),
}));

const store = { prefix: '/factory', client: { send: vi.fn() } } as unknown as ParameterStore;
const tool = createParameterStoreTool(store);
const run = (input: { action: 'list' | 'get' | 'put' | 'delete'; name?: string; value?: string }) =>
  tool.execute!(input, {} as never);

afterEach(() => {
  vi.mocked(runParameterStoreAction).mockReset();
  vi.unstubAllEnvs();
});

describe('parameter_store', () => {
  it('passes the request through with the store and returns the logic result', async () => {
    vi.mocked(runParameterStoreAction).mockResolvedValue({ name: 'EXPO_TOKEN', value: 'v' });

    expect(await run({ action: 'get', name: 'EXPO_TOKEN' })).toEqual({ name: 'EXPO_TOKEN', value: 'v' });
    expect(runParameterStoreAction).toHaveBeenCalledWith(store, { action: 'get', name: 'EXPO_TOKEN' }, undefined);
  });

  it('returns a thrown error as an { error } result', async () => {
    vi.mocked(runParameterStoreAction).mockRejectedValue(new InvalidRequestError('`name` must be …'));

    expect(await run({ action: 'get' })).toEqual({ error: '`name` must be …' });
  });

  it('names the prefix in what the model sees', () => {
    expect(tool.id).toBe('parameter_store');
    expect(tool.description).toContain('/factory');
  });
});

describe('registration', () => {
  async function loadTools(env: Record<string, string | undefined>) {
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    vi.resetModules();
    const { customTools } = await import('../index');
    return customTools.agentTools!({ requestContext: {} as never });
  }

  it('is absent without FACTORY_SSM_PARAMETER_PATH', async () => {
    expect(Object.keys(await loadTools({ FACTORY_SSM_PARAMETER_PATH: undefined }))).toEqual(['get_weather']);
  });

  it('is offered with FACTORY_SSM_PARAMETER_PATH set', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const tools = await loadTools({ FACTORY_SSM_PARAMETER_PATH: '/factory/', AWS_SECRETS_MANAGER_REGION: 'eu-central-1' });

    expect(Object.keys(tools).sort()).toEqual(['get_weather', 'parameter_store']);
    expect(tools.parameter_store!.description).toContain('under /factory.');
  });
});

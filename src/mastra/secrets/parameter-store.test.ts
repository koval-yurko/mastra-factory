/**
 * `loadParameters` and `loadProjectParameters` against a fake client: the
 * request each sends, pagination, the name-to-key mapping, the refusal paths,
 * and the `projects/` subtree kept out of the flat load and the listing.
 */
import { GetParametersByPathCommand } from '@aws-sdk/client-ssm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { listParameterNames, loadParameters, loadProjectParameters } from './parameter-store';

type Page = { Parameters?: { Name?: string; Value?: string }[]; NextToken?: string };

const fakeClient = (...pages: Page[]) => {
  const send = vi.fn(async (_command: GetParametersByPathCommand) => pages.shift() ?? {});
  return { client: { send } as never, send };
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('loadParameters', () => {
  it('asks for every parameter under the prefix, recursive and decrypted', async () => {
    const { client, send } = fakeClient({ Parameters: [{ Name: '/factory/DATABASE_URL', Value: 'postgres://db' }] });

    expect(await loadParameters(client, '/factory')).toEqual({ DATABASE_URL: 'postgres://db' });
    const [command] = send.mock.calls[0]!;
    expect(command).toBeInstanceOf(GetParametersByPathCommand);
    expect(command.input).toEqual({ Path: '/factory', Recursive: true, WithDecryption: true, NextToken: undefined });
  });

  it('follows NextToken until the last page', async () => {
    const { client, send } = fakeClient(
      { Parameters: [{ Name: '/factory/A', Value: '1' }], NextToken: 't1' },
      { Parameters: [{ Name: '/factory/nested/B', Value: '2' }] },
    );

    expect(await loadParameters(client, '/factory')).toEqual({ A: '1', B: '2' });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1]![0].input.NextToken).toBe('t1');
  });

  it('skips a name that is not a valid env key, and names it in the warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { client } = fakeClient({
      Parameters: [
        { Name: '/factory/not-a-key', Value: 'secret-value' },
        { Name: '/factory/OK', Value: 'v' },
      ],
    });

    expect(await loadParameters(client, '/factory')).toEqual({ OK: 'v' });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('/factory/not-a-key'));
    expect(warn.mock.calls.flat().join(' ')).not.toContain('secret-value');
  });

  it('refuses two parameters that map to the same key, without their values', async () => {
    const { client } = fakeClient({
      Parameters: [
        { Name: '/factory/a/KEY', Value: 'first-secret' },
        { Name: '/factory/b/KEY', Value: 'second-secret' },
      ],
    });

    const error = await loadParameters(client, '/factory').catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('Parameters /factory/a/KEY and /factory/b/KEY both map to the environment key KEY.');
  });
});

describe('the projects/ subtree', () => {
  it('is not part of the flat load, so two projects can both hold VERCEL_TOKEN', async () => {
    const { client } = fakeClient({
      Parameters: [
        { Name: '/factory/DATABASE_URL', Value: 'postgres://db' },
        { Name: '/factory/projects/owner/a/VERCEL_TOKEN', Value: 'a-secret' },
        { Name: '/factory/projects/owner/b/VERCEL_TOKEN', Value: 'b-secret' },
      ],
    });

    expect(await loadParameters(client, '/factory')).toEqual({ DATABASE_URL: 'postgres://db' });
  });

  it('loads per project, keyed by the lower-case slug', async () => {
    const { client, send } = fakeClient(
      { Parameters: [{ Name: '/factory/projects/Owner/App/VERCEL_TOKEN', Value: 'a' }], NextToken: 't1' },
      { Parameters: [{ Name: '/factory/projects/owner/other/EXPO_TOKEN', Value: 'b' }] },
    );

    expect(await loadProjectParameters(client, '/factory')).toEqual({
      'owner/app': { VERCEL_TOKEN: 'a' },
      'owner/other': { EXPO_TOKEN: 'b' },
    });
    expect(send.mock.calls[0]![0].input).toEqual({
      Path: '/factory/projects',
      Recursive: true,
      WithDecryption: true,
      NextToken: undefined,
    });
    expect(send.mock.calls[1]![0].input.NextToken).toBe('t1');
  });

  it('skips a name of another shape, without its value', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { client } = fakeClient({
      Parameters: [
        { Name: '/factory/projects/owner/TOKEN', Value: 'secret-value' },
        { Name: '/factory/projects/owner/app/deep/TOKEN', Value: 'secret-value' },
        { Name: '/factory/projects/owner/app/not-a-key', Value: 'secret-value' },
      ],
    });

    expect(await loadProjectParameters(client, '/factory')).toEqual({});
    expect(warn).toHaveBeenCalledTimes(3);
    expect(warn.mock.calls.flat().join(' ')).not.toContain('secret-value');
  });

  it('refuses two names for one secret that differ only in the case of the slug', async () => {
    const { client } = fakeClient({
      Parameters: [
        { Name: '/factory/projects/owner/app/TOKEN', Value: 'first-secret' },
        { Name: '/factory/projects/Owner/app/TOKEN', Value: 'second-secret' },
      ],
    });

    await expect(loadProjectParameters(client, '/factory')).rejects.toThrow(
      'Parameters /factory/projects/owner/app/TOKEN and /factory/projects/Owner/app/TOKEN are the same project secret.',
    );
  });

  it('works under the root prefix', async () => {
    const { client, send } = fakeClient({ Parameters: [{ Name: '/projects/owner/app/TOKEN', Value: 'v' }] });

    expect(await loadProjectParameters(client, '/')).toEqual({ 'owner/app': { TOKEN: 'v' } });
    expect(send.mock.calls[0]![0].input.Path).toBe('/projects');
  });

  it('is not listed by listParameterNames', async () => {
    const { client } = fakeClient({
      Parameters: [{ Name: '/factory/SLACK_APP_BOT_TOKEN' }, { Name: '/factory/projects/owner/app/TOKEN' }],
    });

    expect(await listParameterNames({ prefix: '/factory', client })).toEqual([
      { key: 'SLACK_APP_BOT_TOKEN', name: '/factory/SLACK_APP_BOT_TOKEN' },
    ]);
  });
});

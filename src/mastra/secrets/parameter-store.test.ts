/**
 * `loadParameters` against a fake client: the request it sends, pagination,
 * the name-to-key mapping, and the two refusal paths.
 */
import { GetParametersByPathCommand } from '@aws-sdk/client-ssm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadParameters } from './parameter-store';

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

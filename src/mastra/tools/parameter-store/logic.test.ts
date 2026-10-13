/**
 * `runParameterStoreAction` against a fake SSM client: the AWS request each
 * action sends, what it returns, and the refusals that happen before any call.
 */
import {
  DeleteParameterCommand,
  GetParameterCommand,
  GetParametersByPathCommand,
  PutParameterCommand,
} from '@aws-sdk/client-ssm';
import { describe, expect, it, vi } from 'vitest';
import type { ParameterStore } from '../../secrets/parameter-store';
import { RESTART_NOTE, SHADOWED_NOTE, runParameterStoreAction } from './logic';

function fakeStore(reply: (command: unknown) => unknown = () => ({}), prefix = '/factory') {
  const send = vi.fn(async (command: unknown) => reply(command));
  return { store: { prefix, client: { send } } as unknown as ParameterStore, send };
}

const notFound = () => Object.assign(new Error('ParameterNotFound'), { name: 'ParameterNotFound' });

describe('list', () => {
  it('returns names only, across pages, sorted', async () => {
    const pages = [
      { Parameters: [{ Name: '/factory/nested/B' }], NextToken: 't1' },
      { Parameters: [{ Name: '/factory/A' }] },
    ];
    const { store, send } = fakeStore(() => pages.shift());

    expect(await runParameterStoreAction(store, { action: 'list' })).toEqual({
      prefix: '/factory',
      parameters: [
        { key: 'A', name: '/factory/A' },
        { key: 'B', name: '/factory/nested/B' },
      ],
    });
    const first = send.mock.calls[0]![0] as GetParametersByPathCommand;
    expect(first).toBeInstanceOf(GetParametersByPathCommand);
    expect(first.input).toMatchObject({ Path: '/factory', Recursive: true, WithDecryption: false });
  });
});

describe('get', () => {
  it('returns the decrypted value of <prefix>/<name>', async () => {
    const { store, send } = fakeStore(() => ({ Parameter: { Value: 'xoxb-test' } }));

    expect(await runParameterStoreAction(store, { action: 'get', name: 'SLACK_APP_BOT_TOKEN' })).toEqual({
      name: 'SLACK_APP_BOT_TOKEN',
      value: 'xoxb-test',
    });
    const command = send.mock.calls[0]![0] as GetParameterCommand;
    expect(command).toBeInstanceOf(GetParameterCommand);
    expect(command.input).toEqual({ Name: '/factory/SLACK_APP_BOT_TOKEN', WithDecryption: true });
  });

  it('names the missing parameter', async () => {
    const { store } = fakeStore(() => {
      throw notFound();
    });

    await expect(runParameterStoreAction(store, { action: 'get', name: 'NOPE' })).rejects.toThrow(
      'No parameter named /factory/NOPE exists.',
    );
  });
});

describe('put', () => {
  it('writes a SecureString with overwrite, and says a restart is needed', async () => {
    const { store, send } = fakeStore();

    expect(await runParameterStoreAction(store, { action: 'put', name: 'EXPO_TOKEN', value: 'expo-new' })).toEqual({
      name: 'EXPO_TOKEN',
      parameter: '/factory/EXPO_TOKEN',
      stored: true,
      note: RESTART_NOTE,
    });
    const command = send.mock.calls[0]![0] as PutParameterCommand;
    expect(command).toBeInstanceOf(PutParameterCommand);
    expect(command.input).toEqual({
      Name: '/factory/EXPO_TOKEN',
      Value: 'expo-new',
      Type: 'SecureString',
      Overwrite: true,
    });
  });

  it('warns when the server\'s .env also sets the key, because .env wins', async () => {
    const { store } = fakeStore();
    const isSetLocally = (key: string) => key === 'EXPO_TOKEN';

    expect(
      await runParameterStoreAction(store, { action: 'put', name: 'EXPO_TOKEN', value: 'v' }, isSetLocally),
    ).toMatchObject({ stored: true, note: RESTART_NOTE, warning: SHADOWED_NOTE });
    expect(
      await runParameterStoreAction(store, { action: 'put', name: 'OTHER_KEY', value: 'v' }, isSetLocally),
    ).not.toHaveProperty('warning');
  });

  it('refuses an empty value without an AWS call', async () => {
    const { store, send } = fakeStore();

    await expect(runParameterStoreAction(store, { action: 'put', name: 'EXPO_TOKEN', value: '' })).rejects.toThrow(
      '`value` is required',
    );
    expect(send).not.toHaveBeenCalled();
  });

  it('builds the name without a double slash under the root prefix', async () => {
    const { store, send } = fakeStore(() => ({}), '/');

    await runParameterStoreAction(store, { action: 'put', name: 'EXPO_TOKEN', value: 'v' });
    expect((send.mock.calls[0]![0] as PutParameterCommand).input.Name).toBe('/EXPO_TOKEN');
  });
});

describe('delete', () => {
  it('deletes <prefix>/<name>, and says a restart is needed', async () => {
    const { store, send } = fakeStore();

    expect(await runParameterStoreAction(store, { action: 'delete', name: 'EXPO_TOKEN' })).toMatchObject({
      parameter: '/factory/EXPO_TOKEN',
      deleted: true,
      note: RESTART_NOTE,
    });
    const command = send.mock.calls[0]![0] as DeleteParameterCommand;
    expect(command).toBeInstanceOf(DeleteParameterCommand);
    expect(command.input).toEqual({ Name: '/factory/EXPO_TOKEN' });
  });
});

describe('names', () => {
  it.each([undefined, '', 'lower_case', '../OTHER', 'A/B', 'nested/KEY', '1KEY'])(
    'refuses %j without an AWS call',
    async name => {
      const { store, send } = fakeStore();

      await expect(runParameterStoreAction(store, { action: 'get', name })).rejects.toThrow(
        '`name` must be an environment key name',
      );
      expect(send).not.toHaveBeenCalled();
    },
  );
});

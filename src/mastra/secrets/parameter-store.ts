/**
 * AWS Systems Manager Parameter Store as a source of environment values.
 *
 * Plain TypeScript with no Mastra imports and no environment reads: the client
 * and the path prefix arrive by argument from `../config/env`, which is the one
 * module that reads the environment.
 */
import {
  DeleteParameterCommand,
  GetParameterCommand,
  GetParametersByPathCommand,
  PutParameterCommand,
  type SSMClient,
} from '@aws-sdk/client-ssm';

/** A path prefix (no trailing `/`, or exactly `/`) and the client that reaches it. */
export interface ParameterStore {
  prefix: string;
  client: Pick<SSMClient, 'send'>;
}

/** The full parameter name for an env key directly under `prefix`. */
export function parameterName(prefix: string, key: string): string {
  return prefix === '/' ? `/${key}` : `${prefix}/${key}`;
}

/** What a parameter's last name segment must look like to become an env key. */
const ENV_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Load every parameter under `prefix` (recursively, `SecureString` values
 * decrypted, every page followed) and key each value by the LAST segment of its
 * name: `/mastra-factory/GITHUB_APP_ID` becomes `GITHUB_APP_ID`.
 *
 * A parameter whose last segment is not a valid env key name is skipped with a
 * warning that names it. Two parameters with the same last segment (for example
 * `/p/a/KEY` and `/p/b/KEY`) are an error, because neither can be said to win.
 * Values never appear in a log line or an error message.
 */
export async function loadParameters(client: Pick<SSMClient, 'send'>, prefix: string): Promise<Record<string, string>> {
  const values: Record<string, string> = {};
  const sources: Record<string, string> = {};
  let nextToken: string | undefined;
  do {
    const page = await client.send(
      new GetParametersByPathCommand({ Path: prefix, Recursive: true, WithDecryption: true, NextToken: nextToken }),
    );
    for (const { Name: name, Value: value } of page.Parameters ?? []) {
      if (!name || value === undefined) continue;
      const key = name.slice(name.lastIndexOf('/') + 1);
      if (!ENV_KEY.test(key)) {
        console.warn(`[parameter-store] skipping ${name}: "${key}" is not a valid environment key name.`);
        continue;
      }
      if (key in sources) {
        throw new Error(`Parameters ${sources[key]} and ${name} both map to the environment key ${key}.`);
      }
      sources[key] = name;
      values[key] = value;
    }
    nextToken = page.NextToken;
  } while (nextToken);
  return values;
}

/**
 * The env key names under the store's prefix (recursive), sorted, with the full
 * parameter name of each. No value is requested or returned.
 */
export async function listParameterNames(store: ParameterStore): Promise<{ key: string; name: string }[]> {
  const entries: { key: string; name: string }[] = [];
  let nextToken: string | undefined;
  do {
    const page = await store.client.send(
      new GetParametersByPathCommand({ Path: store.prefix, Recursive: true, WithDecryption: false, NextToken: nextToken }),
    );
    for (const { Name: name } of page.Parameters ?? []) {
      if (name) entries.push({ key: name.slice(name.lastIndexOf('/') + 1), name });
    }
    nextToken = page.NextToken;
  } while (nextToken);
  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

/** The decrypted value of `<prefix>/<key>`. A missing parameter rejects with AWS's `ParameterNotFound`. */
export async function getParameter(store: ParameterStore, key: string): Promise<string> {
  const { Parameter: parameter } = await store.client.send(
    new GetParameterCommand({ Name: parameterName(store.prefix, key), WithDecryption: true }),
  );
  return parameter?.Value ?? '';
}

/** Create or overwrite `<prefix>/<key>` as a `SecureString` (encrypted with the account's default `aws/ssm` key). */
export async function putParameter(store: ParameterStore, key: string, value: string): Promise<void> {
  await store.client.send(
    new PutParameterCommand({ Name: parameterName(store.prefix, key), Value: value, Type: 'SecureString', Overwrite: true }),
  );
}

/** Delete `<prefix>/<key>`. A missing parameter rejects with AWS's `ParameterNotFound`. */
export async function deleteParameter(store: ParameterStore, key: string): Promise<void> {
  await store.client.send(new DeleteParameterCommand({ Name: parameterName(store.prefix, key) }));
}

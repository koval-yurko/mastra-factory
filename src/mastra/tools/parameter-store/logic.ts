/**
 * Parameter Store logic for the `parameter_store` tool: one action per call on
 * the parameters under the configured prefix. Plain TypeScript with no Mastra
 * imports: the tool definition in `./definition` is the only place that knows
 * this is an agent tool, and the store arrives by argument from there.
 *
 * Every name is an env key directly under the prefix — `SLACK_APP_BOT_TOKEN`
 * means `<prefix>/SLACK_APP_BOT_TOKEN` — so the tool cannot reach a parameter
 * outside the prefix.
 */
import {
  deleteParameter,
  getParameter,
  listParameterNames,
  parameterName,
  putParameter,
  type ParameterStore,
} from '../../secrets/parameter-store';

export const ACTIONS = ['list', 'get', 'put', 'delete'] as const;
export type ParameterStoreAction = (typeof ACTIONS)[number];

export interface ParameterStoreRequest {
  action: ParameterStoreAction;
  name?: string;
  value?: string;
}

/** Env key names as the deployment spells them; also what keeps a name inside the prefix. */
const KEY_NAME = /^[A-Z][A-Z0-9_]*$/;

/** Said after every change, because the server reads its configuration once, at boot. */
export const RESTART_NOTE =
  'The running server does not use this change until it restarts. Only keys the Factory configuration reads ' +
  'take effect from Parameter Store; keys that only dependencies read (for example ANTHROPIC_API_KEY, MASTRA_HOST, PORT) must be in .env.';

/** Said with a change to a key that `.env` also sets, because `.env` wins over Parameter Store. */
export const SHADOWED_NOTE =
  'This key is also set in .env (or the shell) on the server, and that value wins over Parameter Store. ' +
  'Remove it from .env for this change to take effect.';

/** Whether the server's own `.env` (or shell) holds a value for a key; see `isSetLocally` in config/env. */
export type IsSetLocally = (key: string) => boolean;

/** A request the tool refuses before any AWS call. */
export class InvalidRequestError extends Error {}

function keyName(name: string | undefined): string {
  if (!name || !KEY_NAME.test(name)) {
    throw new InvalidRequestError('`name` must be an environment key name in upper case, for example "SLACK_APP_BOT_TOKEN".');
  }
  return name;
}

/** AWS reports a missing parameter as an error named `ParameterNotFound`; say which one. */
async function existing<T>(store: ParameterStore, key: string, call: Promise<T>): Promise<T> {
  try {
    return await call;
  } catch (error) {
    if (error instanceof Error && error.name === 'ParameterNotFound') {
      throw new Error(`No parameter named ${parameterName(store.prefix, key)} exists.`);
    }
    throw error;
  }
}

export async function runParameterStoreAction(
  store: ParameterStore,
  request: ParameterStoreRequest,
  isSetLocally: IsSetLocally = () => false,
) {
  const notes = (key: string) => (isSetLocally(key) ? { note: RESTART_NOTE, warning: SHADOWED_NOTE } : { note: RESTART_NOTE });
  switch (request.action) {
    case 'list':
      return { prefix: store.prefix, parameters: await listParameterNames(store) };
    case 'get': {
      const key = keyName(request.name);
      return { name: key, value: await existing(store, key, getParameter(store, key)) };
    }
    case 'put': {
      const key = keyName(request.name);
      if (!request.value) throw new InvalidRequestError('`value` is required for "put" and must not be empty.');
      await putParameter(store, key, request.value);
      return { name: key, parameter: parameterName(store.prefix, key), stored: true, ...notes(key) };
    }
    case 'delete': {
      const key = keyName(request.name);
      await existing(store, key, deleteParameter(store, key));
      return { name: key, parameter: parameterName(store.prefix, key), deleted: true, ...notes(key) };
    }
  }
}

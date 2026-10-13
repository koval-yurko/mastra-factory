/**
 * The Factory Server's logger. Picked up by file-system routing like
 * `./observability.ts` (`mastra.__registerFsLogger()`), never imported.
 *
 * With observability registered, every call through this logger is also
 * forwarded to the observability domain and correlated with the active trace,
 * which is what fills Studio's Logs page.
 *
 * Every message and argument passes through `maskSecrets` first, so the value
 * of a sensitive key (`SENSITIVE_KEYS` in `./config/env`) is written as
 * `[redacted:KEY]` — on stdout and in what observability receives. Child
 * loggers are masked the same way. This covers only what goes through this
 * logger: `console.*` and dependencies with their own logger are not masked.
 */
import { PinoLogger } from '@mastra/loggers';
import { secretValues } from './config/env';

/** Shorter values are not masked: replacing a 3-character string would garble unrelated text. */
const MIN_MASKED_LENGTH = 6;

/**
 * Replace every occurrence of a secret in `value`: strings directly, arrays,
 * plain objects and `Error`s recursively (into copies — the caller's objects are
 * not changed). Other objects pass through unchanged.
 */
export function maskSecrets<T>(value: T, secrets: [string, string][], seen = new WeakSet<object>()): T {
  if (typeof value === 'string') {
    let masked: string = value;
    for (const [key, secret] of secrets) {
      if (secret.length >= MIN_MASKED_LENGTH) masked = masked.replaceAll(secret, `[redacted:${key}]`);
    }
    return masked as T;
  }
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  if (value instanceof Error) {
    const copy = new Error(maskSecrets(value.message, secrets, seen), { cause: value.cause });
    copy.name = value.name;
    copy.stack = maskSecrets(value.stack, secrets, seen);
    return copy as T;
  }
  if (Array.isArray(value)) return value.map(item => maskSecrets(item, secrets, seen)) as T;
  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, maskSecrets(item, secrets, seen)]),
  ) as T;
}

const LEVELS = ['debug', 'info', 'warn', 'error'] as const;

/** Mask every level method of `logger`, and of every child it creates. */
function masked(logger: PinoLogger): PinoLogger {
  for (const level of LEVELS) {
    const write = logger[level].bind(logger);
    logger[level] = (message, args) => {
      const secrets = secretValues();
      write(maskSecrets(message, secrets), maskSecrets(args, secrets));
    };
  }
  const trackException = logger.trackException.bind(logger);
  logger.trackException = (error, metadata) => {
    const secrets = secretValues();
    trackException(maskSecrets(error, secrets), maskSecrets(metadata, secrets));
  };
  const child = logger.child.bind(logger);
  logger.child = bindings => masked(child(bindings));
  return logger;
}

export default masked(new PinoLogger({ name: 'Factory', level: 'info' }));

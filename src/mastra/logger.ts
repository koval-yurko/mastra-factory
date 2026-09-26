/**
 * The Factory Server's logger. Picked up by file-system routing like
 * `./observability.ts` (`mastra.__registerFsLogger()`), never imported.
 *
 * With observability registered, every call through this logger is also
 * forwarded to the observability domain and correlated with the active trace,
 * which is what fills Studio's Logs page.
 *
 * Reads no environment key.
 */
import { PinoLogger } from '@mastra/loggers';

export default new PinoLogger({ name: 'Factory', level: 'info' });

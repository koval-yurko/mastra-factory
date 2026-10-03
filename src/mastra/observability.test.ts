/**
 * Pins what `./observability.ts` and `./logger.ts` hand file-system routing.
 * Neither is imported by the entry, so no other test loads them; `npm run
 * build` is the only other check that sees them, and it proves they bundle,
 * not what they configure.
 */
import { MastraStorageExporter, SensitiveDataFilter } from '@mastra/observability';
import { PinoLogger } from '@mastra/loggers';
import { describe, expect, it } from 'vitest';
import observability, { isStudioNoSessionProbe, requestContextKeys, serializationOptions } from './observability';
import logger from './logger';

describe('observability.ts', () => {
  const instance = observability.getDefaultInstance();

  it('exports a real entrypoint with a default instance', () => {
    // `__registerFsObservability` ignores anything without this method.
    expect(typeof observability.getDefaultInstance).toBe('function');
    expect(instance).toBeDefined();
  });

  it('exports only to local storage — no Platform exporter', () => {
    const exporters = instance!.getExporters();
    expect(exporters).toHaveLength(1);
    expect(exporters[0]).toBeInstanceOf(MastraStorageExporter);
  });

  it('keeps credential redaction on', () => {
    expect(instance!.getSpanOutputProcessors().some(p => p instanceof SensitiveDataFilter)).toBe(true);
  });

  it('raises every serialization limit above the package default', () => {
    // Defaults: 128 KiB strings, 50 array items, 50 keys, depth 8.
    expect(serializationOptions.maxStringLength).toBeGreaterThan(128 * 1024);
    expect(serializationOptions.maxArrayLength).toBeGreaterThan(50);
    expect(serializationOptions.maxObjectKeys).toBeGreaterThan(50);
    expect(serializationOptions.maxDepth).toBeGreaterThan(8);
    expect(instance!.getConfig()).toMatchObject({
      serviceName: 'mastra-factory',
      serializationOptions,
      requestContextKeys,
    });
  });
});

describe('isStudioNoSessionProbe', () => {
  const noSession = { message: 'No model available: this run started without a controller session context, so no model selection could be resolved.' };
  const log = (level: 'warn' | 'error', message: string, data: Record<string, unknown>) =>
    ({ logId: 'l', timestamp: new Date(), level, message, data }) as const;
  const agentList = (message: string, error: unknown, level: 'warn' | 'error' = 'warn') =>
    log(level, message, { agentName: 'Code Agent', error });
  const route = (method: string, path: string, error: unknown = noSession) =>
    log('error', 'Error calling handler', { error, path, method });

  it('drops both agent-list warnings caused by the missing session', () => {
    expect(isStudioNoSessionProbe(agentList('Error getting LLM for agent', noSession))).toBe(true);
    expect(isStudioNoSessionProbe(agentList('Error getting model list for agent', new Error(noSession.message)))).toBe(true);
  });

  it('drops the voice probes an agent page makes', () => {
    expect(isStudioNoSessionProbe(route('GET', '/agents/:agentId/voice/speakers'))).toBe(true);
    expect(isStudioNoSessionProbe(route('GET', '/agents/:agentId/speakers'))).toBe(true);
    expect(isStudioNoSessionProbe(route('GET', '/agents/:agentId/voice/listener'))).toBe(true);
  });

  it('keeps the no-session error on any other route', () => {
    expect(isStudioNoSessionProbe(route('POST', '/agents/:agentId/generate'))).toBe(false);
    expect(isStudioNoSessionProbe(route('POST', '/agents/:agentId/voice/speak'))).toBe(false);
  });

  it('keeps the same messages with any other cause, level or message', () => {
    expect(isStudioNoSessionProbe(agentList('Error getting LLM for agent', { message: 'No usable google credential' }))).toBe(false);
    expect(isStudioNoSessionProbe(agentList('Error getting LLM for agent', undefined))).toBe(false);
    expect(isStudioNoSessionProbe(agentList('Error getting LLM for agent', noSession, 'error'))).toBe(false);
    expect(isStudioNoSessionProbe(agentList('Error generating title', noSession))).toBe(false);
    expect(isStudioNoSessionProbe(route('GET', '/agents/:agentId/voice/speakers', { message: 'boom' }))).toBe(false);
  });
});

describe('logger.ts', () => {
  it('exports a PinoLogger', () => {
    // `__registerFsLogger` takes any MastraLogger; Pino is what forwards to observability.
    expect(logger).toBeInstanceOf(PinoLogger);
  });
});

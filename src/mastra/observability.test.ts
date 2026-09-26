/**
 * Pins what `./observability.ts` and `./logger.ts` hand file-system routing.
 * Neither is imported by the entry, so no other test loads them; `npm run
 * build` is the only other check that sees them, and it proves they bundle,
 * not what they configure.
 */
import { MastraStorageExporter, SensitiveDataFilter } from '@mastra/observability';
import { PinoLogger } from '@mastra/loggers';
import { describe, expect, it } from 'vitest';
import observability, { requestContextKeys, serializationOptions } from './observability';
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

describe('logger.ts', () => {
  it('exports a PinoLogger', () => {
    // `__registerFsLogger` takes any MastraLogger; Pino is what forwards to observability.
    expect(logger).toBeInstanceOf(PinoLogger);
  });
});

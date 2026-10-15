/**
 * `./sandbox-catalog`: what a `sandbox.json` and a built catalog may say. The
 * build and the server both go through these functions, so a value refused here
 * can never decide a container's image, ceiling or secrets.
 */
import { describe, expect, it } from 'vitest';
import { normalizeSlug, parseDefaultsSource, parseProjectSource, parseSandboxCatalog } from './sandbox-catalog';

const FILE = 'sandbox/projects/owner/app/sandbox.json';

describe('normalizeSlug', () => {
  it('lower-cases and trims an owner/name slug', () => {
    expect(normalizeSlug(' Owner/My-App ')).toBe('owner/my-app');
    expect(normalizeSlug('owner/app.web')).toBe('owner/app.web');
  });

  it('refuses what is not two Docker-safe path components', () => {
    for (const bad of [undefined, '', 'owner', 'owner/app/extra', 'owner/..', '../app', 'owner/.github', 'owner/app-', 'own er/app']) {
      expect(normalizeSlug(bad)).toBeUndefined();
    }
  });
});

describe('parseDefaultsSource', () => {
  it('needs both ceilings', () => {
    expect(parseDefaultsSource({ memoryGib: 10, cpus: 4 }, 'sandbox/sandbox.json')).toEqual({ memoryGib: 10, cpus: 4 });
    expect(() => parseDefaultsSource({ memoryGib: 10 }, 'sandbox/sandbox.json')).toThrow(
      'sandbox/sandbox.json: cpus must be a number of at least 0.01, with at most 2 decimal places.',
    );
  });

  it('refuses a field it does not know, so a typo is not silently ignored', () => {
    expect(() => parseDefaultsSource({ memoryGib: 10, cpus: 4, memory: 12 }, 'sandbox/sandbox.json')).toThrow(
      'unknown field(s) memory',
    );
  });
});

describe('parseProjectSource', () => {
  it('accepts an empty object: the project takes every shared value', () => {
    expect(parseProjectSource({}, FILE)).toEqual({});
  });

  it('accepts ceilings equal to the host bounds and refuses one above, naming the file', () => {
    expect(parseProjectSource({ memoryGib: 10, cpus: 6 }, FILE)).toEqual({ memoryGib: 10, cpus: 6 });
    expect(() => parseProjectSource({ memoryGib: 10.5 }, FILE)).toThrow(
      /sandbox\/projects\/owner\/app\/sandbox\.json: memoryGib is 10\.5, which is more than the 10 GiB[\s\S]*sandbox\/README\.md/,
    );
    expect(() => parseProjectSource({ cpus: 7 }, FILE)).toThrow(/cpus is 7, which is more than the 6 cores/);
  });

  it('accepts a part of a core or a gibibyte, with up to 2 decimal places', () => {
    expect(parseProjectSource({ memoryGib: 0.25, cpus: 0.01 }, FILE)).toEqual({ memoryGib: 0.25, cpus: 0.01 });
    expect(parseProjectSource({ memoryGib: 1.5, cpus: 0.5 }, FILE)).toEqual({ memoryGib: 1.5, cpus: 0.5 });
  });

  it('refuses a ceiling below the minimum, with too many decimals, or not a number', () => {
    for (const bad of [0, -1, 0.005, 0.125, '1', null, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => parseProjectSource({ cpus: bad }, FILE)).toThrow('cpus must be a number of at least 0.01, with at most 2 decimal places.');
    }
    expect(() => parseProjectSource({ memoryGib: 0.2 }, FILE)).toThrow('memoryGib must be a number of at least 0.25');
  });

  it('accepts a list of env names as secrets', () => {
    expect(parseProjectSource({ secrets: ['VERCEL_TOKEN', 'EXPO_TOKEN'] }, FILE)).toEqual({
      secrets: ['VERCEL_TOKEN', 'EXPO_TOKEN'],
    });
  });

  it('refuses a malformed, reserved or repeated secret name', () => {
    expect(() => parseProjectSource({ secrets: 'VERCEL_TOKEN' }, FILE)).toThrow('secrets must be an array');
    expect(() => parseProjectSource({ secrets: ['VERCEL-TOKEN'] }, FILE)).toThrow('is not an environment variable name');
    expect(() => parseProjectSource({ secrets: [1] }, FILE)).toThrow('is not an environment variable name');
    expect(() => parseProjectSource({ secrets: ['PATH'] }, FILE)).toThrow('secrets cannot set PATH');
    expect(() => parseProjectSource({ secrets: ['A', 'A'] }, FILE)).toThrow('secrets lists A twice');
  });

  it('refuses an image field: tags come from the build, never from the file', () => {
    expect(() => parseProjectSource({ image: 'factory-sandbox/owner/app:2026-10-01-abcdefabcdef' }, FILE)).toThrow(
      'unknown field(s) image',
    );
  });

  it('refuses a root that is not an object', () => {
    for (const bad of [null, [], 'x', 3]) expect(() => parseProjectSource(bad, FILE)).toThrow('must be a JSON object');
  });
});

describe('parseSandboxCatalog', () => {
  const catalog = {
    version: 1,
    default: { image: 'factory-sandbox:2026-10-01-0123456789ab', memoryGib: 10, cpus: 4 },
    projects: {
      'owner/app': { image: 'factory-sandbox/owner/app:2026-10-01-abcdefabcdef', secrets: ['VERCEL_TOKEN'] },
      'owner/plain': { memoryGib: 2, secrets: [] },
    },
  };

  it('returns a valid catalog unchanged', () => {
    expect(parseSandboxCatalog(catalog, 'c.json')).toEqual(catalog);
  });

  it('refuses a moving, date-only or foreign image tag', () => {
    for (const image of ['factory-sandbox:latest', 'factory-sandbox:2026-10-01', 'node:22', 'factory-sandbox/owner/app:2026-10-01-0123456789ab']) {
      expect(() => parseSandboxCatalog({ ...catalog, default: { ...catalog.default, image } }, 'c.json')).toThrow(
        'image must be factory-sandbox:YYYY-MM-DD-<12 hex>',
      );
    }
  });

  it('refuses a project image from another project\'s repository', () => {
    const projects = { 'owner/app': { image: 'factory-sandbox/owner/other:2026-10-01-abcdefabcdef', secrets: [] } };
    expect(() => parseSandboxCatalog({ ...catalog, projects }, 'c.json')).toThrow(
      'image must be factory-sandbox/owner/app:YYYY-MM-DD-<12 hex>',
    );
  });

  it('refuses a key that is not a lower-case slug', () => {
    expect(() => parseSandboxCatalog({ ...catalog, projects: { 'Owner/App': { secrets: [] } } }, 'c.json')).toThrow(
      'not a lower-case owner/name slug',
    );
  });

  it('refuses another version, a missing default and an over-bound value', () => {
    expect(() => parseSandboxCatalog({ ...catalog, version: 2 }, 'c.json')).toThrow('version must be 1');
    expect(() => parseSandboxCatalog({ ...catalog, default: undefined }, 'c.json')).toThrow('default must be an object');
    expect(() =>
      parseSandboxCatalog({ ...catalog, projects: { 'owner/app': { memoryGib: 64, secrets: [] } } }, 'c.json'),
    ).toThrow('memoryGib is 64');
  });
});

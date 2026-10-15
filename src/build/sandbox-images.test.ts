/**
 * `readSandboxSources` on a fake `sandbox/` tree in a temporary folder: the
 * catalog it builds, the tag recipe, and the files it refuses. The commit date
 * is injected, so no case needs git; the Docker half of the module is not
 * exercised here (the image pipeline runs it).
 */
import { mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readSandboxSources, type InputDate } from './sandbox-images';

const BASE = 'FROM node:22-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392\n';
const date: InputDate = () => '2026-10-01';

let root: string;

function write(path: string, content: string) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'sandbox-images-'));
  write('sandbox/sandbox.json', JSON.stringify({ memoryGib: 10, cpus: 4 }));
  write('sandbox/factory-sandbox.Dockerfile', `${BASE}WORKDIR /workspace\nCMD ["sleep", "infinity"]\n`);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('readSandboxSources', () => {
  it('names the shared image with the input date and a 12-digit hash', () => {
    const { catalog, images } = readSandboxSources(root, date);

    expect(catalog.default).toEqual({ image: expect.stringMatching(/^factory-sandbox:2026-10-01-[0-9a-f]{12}$/), memoryGib: 10, cpus: 4 });
    expect(catalog.projects).toEqual({});
    expect(images.map(image => image.tag)).toEqual([catalog.default.image]);
  });

  it('gives a project with a Dockerfile its own image, built from its own folder', () => {
    write('sandbox/projects/Owner/App/Dockerfile', `${BASE}WORKDIR /workspace\n`);
    write('sandbox/projects/Owner/App/sandbox.json', JSON.stringify({ cpus: 2, secrets: ['VERCEL_TOKEN'] }));

    const { catalog, images } = readSandboxSources(root, date);

    expect(catalog.projects).toEqual({
      'owner/app': { image: expect.stringMatching(/^factory-sandbox\/owner\/app:2026-10-01-[0-9a-f]{12}$/), cpus: 2, secrets: ['VERCEL_TOKEN'] },
    });
    expect(images[1]).toMatchObject({
      slug: 'owner/app',
      context: 'sandbox/projects/Owner/App',
      dockerfile: 'sandbox/projects/Owner/App/Dockerfile',
      inputs: ['sandbox/projects/Owner/App/Dockerfile'],
    });
  });

  it('gives a project without a Dockerfile no image of its own', () => {
    write('sandbox/projects/owner/plain/sandbox.json', JSON.stringify({ memoryGib: 4 }));

    expect(readSandboxSources(root, date).catalog.projects).toEqual({ 'owner/plain': { memoryGib: 4, secrets: [] } });
  });

  it('changes the tag when an input changes, and not when sandbox.json does', () => {
    write('sandbox/projects/owner/app/Dockerfile', `${BASE}WORKDIR /workspace\n`);
    write('sandbox/projects/owner/app/sandbox.json', '{}');
    const first = readSandboxSources(root, date).catalog.projects['owner/app']?.image;

    write('sandbox/projects/owner/app/sandbox.json', JSON.stringify({ cpus: 2 }));
    expect(readSandboxSources(root, date).catalog.projects['owner/app']?.image).toBe(first);

    write('sandbox/projects/owner/app/setup.sh', 'echo hi\n');
    expect(readSandboxSources(root, date).catalog.projects['owner/app']?.image).not.toBe(first);
  });

  it('gives the same inputs the same tag in another checkout', () => {
    const first = readSandboxSources(root, date).catalog.default.image;
    const other = root;
    root = mkdtempSync(join(tmpdir(), 'sandbox-images-'));
    write('sandbox/sandbox.json', JSON.stringify({ memoryGib: 2, cpus: 4 }));
    write('sandbox/factory-sandbox.Dockerfile', `${BASE}WORKDIR /workspace\nCMD ["sleep", "infinity"]\n`);
    try {
      expect(readSandboxSources(root, date).catalog.default.image).toBe(first);
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });

  it('uses today when no commit touches the inputs', () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(readSandboxSources(root, () => undefined).catalog.default.image).toContain(`:${today}-`);
  });

  it('refuses a base image without a digest, but allows an earlier stage', () => {
    write('sandbox/factory-sandbox.Dockerfile', 'FROM node:22-bookworm-slim\n');
    expect(() => readSandboxSources(root, date)).toThrow('FROM node:22-bookworm-slim has no @sha256: digest');

    write('sandbox/factory-sandbox.Dockerfile', `${BASE.trim()} AS tools\nFROM tools\n`);
    expect(() => readSandboxSources(root, date)).not.toThrow();
  });

  it('refuses an env file or a symbolic link in a build context', () => {
    write('sandbox/projects/owner/app/Dockerfile', BASE);
    write('sandbox/projects/owner/app/sandbox.json', '{}');
    write('sandbox/projects/owner/app/.env', 'SECRET=1');
    expect(() => readSandboxSources(root, date)).toThrow('.env: an env file cannot be part of an image build context');

    rmSync(join(root, 'sandbox/projects/owner/app/.env'));
    symlinkSync('/etc/hosts', join(root, 'sandbox/projects/owner/app/hosts'));
    expect(() => readSandboxSources(root, date)).toThrow('symbolic links cannot be part of an image build context');
  });

  it('refuses a project folder without sandbox.json, or with files but no Dockerfile', () => {
    write('sandbox/projects/owner/app/Dockerfile', BASE);
    expect(() => readSandboxSources(root, date)).toThrow('sandbox/projects/owner/app/sandbox.json: is missing.');

    rmSync(join(root, 'sandbox/projects/owner/app/Dockerfile'));
    write('sandbox/projects/owner/app/sandbox.json', '{}');
    write('sandbox/projects/owner/app/setup.sh', 'echo hi\n');
    expect(() => readSandboxSources(root, date)).toThrow('has files besides sandbox.json but no Dockerfile');
  });

  it('refuses a folder name that cannot be a slug, and two folders for one slug', () => {
    write('sandbox/projects/owner/.github/sandbox.json', '{}');
    expect(() => readSandboxSources(root, date)).toThrow('owner/.github is not a repository slug');

    rmSync(join(root, 'sandbox/projects/owner'), { recursive: true });
    write('sandbox/projects/owner/app/sandbox.json', '{}');
    write('sandbox/projects/Owner/app/sandbox.json', '{}');
    // On a case-insensitive file system (macOS by default) the two are one folder.
    if (readdirSync(join(root, 'sandbox/projects')).length === 2) {
      expect(() => readSandboxSources(root, date)).toThrow('a second folder for owner/app');
    }
  });

  it('refuses an invalid sandbox.json, naming the file', () => {
    write('sandbox/projects/owner/app/sandbox.json', '{ "cpus": 99 }');
    expect(() => readSandboxSources(root, date)).toThrow('sandbox/projects/owner/app/sandbox.json: cpus is 99');

    write('sandbox/projects/owner/app/sandbox.json', '{');
    expect(() => readSandboxSources(root, date)).toThrow('sandbox/projects/owner/app/sandbox.json: is not valid JSON');
  });

  it('ignores macOS litter', () => {
    write('sandbox/projects/.DS_Store', '');
    write('sandbox/projects/owner/plain/sandbox.json', '{}');
    write('sandbox/projects/owner/plain/.DS_Store', '');

    expect(Object.keys(readSandboxSources(root, date).catalog.projects)).toEqual(['owner/plain']);
  });
});

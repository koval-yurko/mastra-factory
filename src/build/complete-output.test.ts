/**
 * The post-build step on a fake repo in a temporary folder: a fake CLI UI, a
 * stale public/factory, a skill override, a fake server build, and a minimal
 * sandbox/ tree.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { completeOutput } from './complete-output';

let root: string;

function write(path: string, content = 'x') {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'complete-output-'));
  write('node_modules/mastra/package.json', JSON.stringify({ version: '9.9.9' }));
  write('node_modules/mastra/dist/factory/index.html', 'new ui');
  write('node_modules/mastra/dist/factory/assets/app.js', 'new');
  write('src/mastra/public/factory/index.html', 'stale ui');
  write('src/mastra/public/factory/assets/old.js', 'old');
  write('src/mastra/public/factory-skills/operator-profile/SKILL.md', 'skill');
  write('.mastra/output/index.mjs', 'server');
  write('sandbox/sandbox.json', JSON.stringify({ memoryGib: 10, cpus: 4 }));
  write('sandbox/factory-sandbox.Dockerfile', `FROM node:22@sha256:${'0'.repeat(64)}\n`);
});

const inputDate = () => '2026-10-01';

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('completeOutput', () => {
  it('serves the CLI UI and the skill overrides from the output', () => {
    const result = completeOutput({ root, inputDate });

    expect(result).toEqual({
      ui: 'mastra@9.9.9',
      publicEntries: ['factory', 'factory-skills'],
      sandboxImages: [expect.stringMatching(/^factory-sandbox:2026-10-01-[0-9a-f]{12}$/)],
    });
    expect(readFileSync(join(root, '.mastra/output/factory/index.html'), 'utf8')).toBe('new ui');
    expect(existsSync(join(root, '.mastra/output/factory/assets/app.js'))).toBe(true);
    expect(existsSync(join(root, '.mastra/output/factory-skills/operator-profile/SKILL.md'))).toBe(true);
    expect(JSON.parse(readFileSync(join(root, '.mastra/output/mastra-project.json'), 'utf8'))).toEqual({
      schemaVersion: 1,
      projectType: 'factory',
      assets: { ui: 'factory' },
    });
  });

  it('replaces a stale public/factory instead of merging into it', () => {
    completeOutput({ root, inputDate });

    expect(readFileSync(join(root, 'src/mastra/public/factory/index.html'), 'utf8')).toBe('new ui');
    expect(existsSync(join(root, 'src/mastra/public/factory/assets/old.js'))).toBe(false);
    expect(existsSync(join(root, '.mastra/output/factory/assets/old.js'))).toBe(false);
  });

  it('writes the sandbox catalog into the output, where the server reads it', () => {
    const { sandboxImages } = completeOutput({ root, inputDate });

    expect(JSON.parse(readFileSync(join(root, '.mastra/output/sandbox-catalog.json'), 'utf8'))).toEqual({
      version: 1,
      default: { image: sandboxImages[0], memoryGib: 10, cpus: 4 },
      projects: {},
    });
  });

  it('fails on an invalid sandbox source, before a release could carry it', () => {
    write('sandbox/projects/owner/app/sandbox.json', '{ "memoryGib": 64 }');
    expect(() => completeOutput({ root, inputDate })).toThrow(/sandbox\/projects\/owner\/app\/sandbox\.json: memoryGib is 64/);
  });

  it('fails without a server build', () => {
    rmSync(join(root, '.mastra'), { recursive: true });
    expect(() => completeOutput({ root, inputDate })).toThrow(/No server build/);
  });

  it('fails when the CLI ships no UI', () => {
    rmSync(join(root, 'node_modules/mastra/dist/factory'), { recursive: true });
    expect(() => completeOutput({ root, inputDate })).toThrow(/no prebuilt Factory UI/);
  });
});

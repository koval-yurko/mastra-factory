/**
 * The post-build step on a fake repo in a temporary folder: a fake CLI UI, a
 * stale public/factory, a skill override, and a fake server build.
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
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('completeOutput', () => {
  it('serves the CLI UI and the skill overrides from the output', () => {
    const result = completeOutput({ root });

    expect(result).toEqual({ ui: 'mastra@9.9.9', publicEntries: ['factory', 'factory-skills'] });
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
    completeOutput({ root });

    expect(readFileSync(join(root, 'src/mastra/public/factory/index.html'), 'utf8')).toBe('new ui');
    expect(existsSync(join(root, 'src/mastra/public/factory/assets/old.js'))).toBe(false);
    expect(existsSync(join(root, '.mastra/output/factory/assets/old.js'))).toBe(false);
  });

  it('fails without a server build', () => {
    rmSync(join(root, '.mastra'), { recursive: true });
    expect(() => completeOutput({ root })).toThrow(/No server build/);
  });

  it('fails when the CLI ships no UI', () => {
    rmSync(join(root, 'node_modules/mastra/dist/factory'), { recursive: true });
    expect(() => completeOutput({ root })).toThrow(/no prebuilt Factory UI/);
  });
});

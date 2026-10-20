/**
 * The post-build step on a fake repo in a temporary folder: a fake CLI UI, a
 * stale public/factory, a skill override, a fake server build, and a minimal
 * sandbox/ tree. The patch tests add a patches/ folder and run the real `patch`.
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
      patches: [],
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

  describe('patches', () => {
    const installedPatch = [
      'diff --git a/node_modules/@scope/pkg/dist/a.js b/node_modules/@scope/pkg/dist/a.js',
      '--- a/node_modules/@scope/pkg/dist/a.js',
      '+++ b/node_modules/@scope/pkg/dist/a.js',
      '@@ -1,3 +1,3 @@',
      ' const a = 1;',
      '-const b = 2;',
      '+const b = process.env.PATCHED ?? 3;',
      ' export { a, b };',
      '',
    ].join('\n');
    const bundledPatch = [
      'diff --git a/node_modules/inlined/dist/b.js b/node_modules/inlined/dist/b.js',
      '--- a/node_modules/inlined/dist/b.js',
      '+++ b/node_modules/inlined/dist/b.js',
      '@@ -1,2 +1,3 @@',
      ' function f() {',
      '+\tconst who = process.env.WHO ?? "local-user";',
      '+\t// a comment the bundler may drop',
      ' }',
      '',
    ].join('\n');

    beforeEach(() => {
      write('patches/@scope+pkg+1.2.3.patch', installedPatch);
      write('.mastra/output/node_modules/@scope/pkg/package.json', JSON.stringify({ version: '1.2.3' }));
      write('.mastra/output/node_modules/@scope/pkg/dist/a.js', 'const a = 1;\nconst b = 2;\nexport { a, b };\n');
      write('patches/inlined+4.5.6.patch', bundledPatch);
      write('.mastra/output/routes-abc.mjs', "function f() {\n\tconst who = process.env.WHO ?? 'local-user'\n}\n");
    });

    const patched = () => readFileSync(join(root, '.mastra/output/node_modules/@scope/pkg/dist/a.js'), 'utf8');

    it('applies a patch to the installed copy and finds an inlined one in the bundle', () => {
      const { patches } = completeOutput({ root, inputDate });

      expect(patches).toEqual([
        { file: '@scope+pkg+1.2.3.patch', via: 'installed' },
        { file: 'inlined+4.5.6.patch', via: 'bundled' },
      ]);
      expect(patched()).toBe('const a = 1;\nconst b = process.env.PATCHED ?? 3;\nexport { a, b };\n');
    });

    it('accepts an output that is already patched', () => {
      completeOutput({ root, inputDate });
      completeOutput({ root, inputDate });

      expect(patched()).toBe('const a = 1;\nconst b = process.env.PATCHED ?? 3;\nexport { a, b };\n');
    });

    it('fails when the output installs another version', () => {
      write('.mastra/output/node_modules/@scope/pkg/package.json', JSON.stringify({ version: '1.2.4' }));
      expect(() => completeOutput({ root, inputDate })).toThrow(/installs @scope\/pkg@1\.2\.4, not 1\.2\.3/);
    });

    it('fails when the patch does not apply', () => {
      write('.mastra/output/node_modules/@scope/pkg/dist/a.js', 'const a = 1;\nconst b = 5;\nexport { a, b };\n');
      expect(() => completeOutput({ root, inputDate })).toThrow(/@scope\+pkg\+1\.2\.3\.patch does not apply/);
    });

    it('fails when an inlined patch is not in the bundle', () => {
      write('.mastra/output/routes-abc.mjs', 'function f() {}\n');
      expect(() => completeOutput({ root, inputDate })).toThrow(/inlined is not installed in the output, and the bundle lacks 1 added line/);
    });

    it('fails on a patch-package name form it does not handle', () => {
      write('patches/@scope+pkg+1.2.3.dev.patch', installedPatch);
      expect(() => completeOutput({ root, inputDate })).toThrow(/not a plain <package>\+<version>\.patch name/);
    });
  });
});

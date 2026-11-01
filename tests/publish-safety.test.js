#!/usr/bin/env node
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'publish-openclaw-skills.js'), 'utf8');

// Run the actual publisher with a fake CLI so no skill is ever published.
function simulate(platform, passed = []) {
  const calls = [];
  const fakeFs = {
    readFileSync: () => '{"version":"5.3.3"}',
    readdirSync: () => [{ name: 'ponytail-review', isDirectory: () => true }],
    existsSync: () => true,
  };
  const fakeProcess = {
    platform,
    argv: ['node', 'publish-openclaw-skills.js', ...passed],
    exit: (code) => { throw new Error('exit ' + code); },
  };
  const fakeRequire = (id) => id === 'fs' ? fakeFs
    : id === 'child_process' ? { spawnSync: (...args) => { calls.push(args); return { status: 0 }; } }
    : require(id);
  vm.runInNewContext(source, {
    require: fakeRequire, process: fakeProcess,
    console: { log() {}, error() {} },
    __dirname: path.join(__dirname, '..', 'scripts'),
  });
  return calls;
}

test('POSIX publisher uses argv without a shell', () => {
  const calls = simulate('linux', ['--dry-run']);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'clawhub');
  assert.equal(calls[0][1].at(-1), '--dry-run');
  assert.equal(calls[0][2].shell, undefined);
});

test('Windows publisher uses a shell for the npm .cmd shim', () => {
  const calls = simulate('win32', ['--dry-run']);
  assert.equal(calls.length, 1);
  assert.match(calls[0][0], /clawhub skill publish/);
  assert.equal(calls[0][1].shell, true);
});

test('Windows publisher rejects shell metacharacters before invoking a command', () => {
  for (const arg of ['$(id)', '%PATH%', 'foo&bar', 'x"y', 'a\\b']) {
    assert.throws(() => simulate('win32', [arg]), /exit 1/, arg);
  }
});

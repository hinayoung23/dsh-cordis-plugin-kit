import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { childInvocation, runChild } from '../lib/process.js'

test('Windows package-manager shims use an explicit command interpreter', () => {
  for (const command of ['npm', 'pnpm', 'yarn', 'npm.cmd']) {
    const invocation = childInvocation(command, ['run', 'test'], 'win32', { ComSpec: 'C:\\Windows\\System32\\cmd.exe' })
    assert.equal(invocation.command, 'C:\\Windows\\System32\\cmd.exe')
    assert.equal(invocation.windowsVerbatimArguments, true)
    assert.match(invocation.args[3], /^"(?:npm|pnpm|yarn)\.cmd "run" "test""$/)
  }
  assert.deepEqual(childInvocation('node', ['a b.js'], 'win32'), { command: 'node', args: ['a b.js'] })
  assert.deepEqual(childInvocation('npm', ['test'], 'linux'), { command: 'npm', args: ['test'] })
})

test('Windows shim arguments cannot introduce shell expansion or commands', () => {
  for (const arg of ['a&whoami', '%PATH%', '!PATH!', 'a"b', 'a|b', 'a\nb', '(whoami)', '^x']) {
    assert.throws(() => childInvocation('npm', [arg], 'win32'), /shell metacharacters/)
  }
})

test('npm executes tests and package checks in a Unicode path with spaces', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cordis 中文 space-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeFile(path.join(root, 'package.json'), JSON.stringify({
    name: 'cordis-process-fixture', version: '1.0.0', scripts: { test: 'node --test test.cjs' },
  }))
  await writeFile(path.join(root, 'test.cjs'), 'require("node:test")("child test actually executes", () => console.log("process-fixture-ok"))\n')
  const tested = await runChild('npm', ['test'], { cwd: root })
  assert.equal(tested.code, 0, tested.output)
  assert.match(tested.output, /process-fixture-ok/)
  const packed = await runChild('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: root })
  assert.equal(packed.code, 0, packed.output)
  assert.equal(JSON.parse(packed.output)[0].name, 'cordis-process-fixture')
})

test('child errors and timeouts are reported', async () => {
  await assert.rejects(runChild('cordis-nonexistent-command-12345', []), { code: 'ENOENT' })
  const result = await runChild(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { timeoutMs: 300 })
  assert.equal(result.timedOut, true)
  assert.notEqual(result.code, 0)
})

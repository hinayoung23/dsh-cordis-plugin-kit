import assert from 'node:assert/strict'
import { cp, mkdir, mkdtemp, readFile, rm, symlink } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { runQuality } from '../lib/quality.js'

const goodFixture = fileURLToPath(new URL('./fixtures/good/', import.meta.url))
const kitRoot = fileURLToPath(new URL('../', import.meta.url))

async function fixture(t) {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'dsh-cordis-quality-'))
  t.after(() => rm(parent, { recursive: true, force: true }))
  const root = path.join(parent, 'plugin')
  await cp(goodFixture, root, { recursive: true })
  await mkdir(path.join(root, 'node_modules'), { recursive: true })
  await symlink(path.join(kitRoot, 'node_modules/@deepseek-ai'), path.join(root, 'node_modules/@deepseek-ai'), 'junction')
  return root
}

test('save checkpoint stays static and emits interoperable reports', async t => {
  const root = await fixture(t)
  const result = await runQuality(root, 'save')
  assert.equal(result.passed, true)
  assert.deepEqual(result.stages.map(item => item.name), ['static'])
  assert.equal(JSON.parse(await readFile(result.reports.json, 'utf8')).checkpoint, 'save')
  assert.match(await readFile(result.reports.junit, 'utf8'), /<testsuites/)
  assert.equal(JSON.parse(await readFile(result.reports.sarif, 'utf8')).version, '2.1.0')
  assert.match(await readFile(result.reports.markdown, 'utf8'), /Quality gate|Result/)
})

test('CI checkpoint runs static, tests, runtime, performance and package gates', async t => {
  const root = await fixture(t)
  const result = await runQuality(root, 'ci', { iterations: 2, timeoutMs: 30_000 })
  assert.equal(result.passed, true, JSON.stringify(result.stages, null, 2))
  assert.deepEqual(result.stages.map(item => item.name), ['static', 'test', 'runtime', 'performance', 'package'])
  assert.doesNotMatch(result.stages.find(item => item.name === 'performance').summary, /undefined/)
})

test('reports reject a directory symlink that escapes the project', async t => {
  const root = await fixture(t)
  const outside = await mkdtemp(path.join(os.tmpdir(), 'dsh-cordis-report-outside-'))
  t.after(() => rm(outside, { recursive: true, force: true }))
  await symlink(outside, path.join(root, '.cordis-kit'), 'junction')
  await assert.rejects(runQuality(root, 'save'), /符号链接越出项目/)
})

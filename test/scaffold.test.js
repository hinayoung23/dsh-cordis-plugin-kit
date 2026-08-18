import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { checkProject } from '../lib/checker.js'
import { scaffoldProject } from '../lib/scaffold.js'

test('scaffolder creates a strict-clean DSH Cordis project', async t => {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'dsh-cordis-kit-'))
  t.after(() => rm(parent, { recursive: true, force: true }))
  const target = path.join(parent, 'sample-plugin')
  const result = await scaffoldProject(target, { name: 'sample-cordis-plugin' })
  assert.equal(result.packageName, 'sample-cordis-plugin')
  assert.match(await readFile(path.join(target, 'cordis.patch.yml'), 'utf8'), /name: sample-cordis-plugin/)
  const report = await checkProject(target, { strict: true })
  assert.equal(report.passed, true, JSON.stringify(report.diagnostics, null, 2))
})

test('scaffolder refuses traversal-like package names and non-empty targets', async t => {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'dsh-cordis-kit-'))
  t.after(() => rm(parent, { recursive: true, force: true }))
  await assert.rejects(scaffoldProject(path.join(parent, 'bad'), { name: '../bad' }), /无效的 npm 包名/)
  const target = path.join(parent, 'occupied')
  await scaffoldProject(target, { name: 'first-plugin' })
  await writeFile(path.join(target, 'user-data.txt'), 'keep me')
  await assert.rejects(scaffoldProject(target, { name: 'second-plugin' }), /目标目录非空/)
  assert.equal(await readFile(path.join(target, 'user-data.txt'), 'utf8'), 'keep me')
})

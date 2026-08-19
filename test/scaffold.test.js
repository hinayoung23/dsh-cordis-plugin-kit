import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { setupAutomation } from '../lib/automation.js'
import { checkProject } from '../lib/checker.js'
import { scaffoldProject } from '../lib/scaffold.js'

test('scaffolder creates a strict-clean DSH Cordis project', async t => {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'dsh-cordis-kit-'))
  t.after(() => rm(parent, { recursive: true, force: true }))
  const target = path.join(parent, 'sample-plugin')
  const result = await scaffoldProject(target, { name: 'sample-cordis-plugin' })
  assert.equal(result.packageName, 'sample-cordis-plugin')
  assert.match(await readFile(path.join(target, 'cordis.patch.yml'), 'utf8'), /name: sample-cordis-plugin/)
  assert.match(await readFile(path.join(target, 'AGENTS.md'), 'utf8'), /checkpoint pre-push/)
  assert.match(await readFile(path.join(target, '.github/workflows/cordis-quality.yml'), 'utf8'), /pnpm exec dsh-cordis-kit ci/)
  assert.ok((await stat(path.join(target, '.githooks/pre-commit'))).mode & 0o100)
  assert.equal(result.automation.hookPathConfigured, true)
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

test('automation setup refuses an escaping hooks symlink', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dsh-cordis-automation-'))
  const outside = await mkdtemp(path.join(os.tmpdir(), 'dsh-cordis-hooks-outside-'))
  t.after(() => Promise.all([rm(root, { recursive: true, force: true }), rm(outside, { recursive: true, force: true })]))
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ scripts: {} }))
  await symlink(outside, path.join(root, '.githooks'), 'dir')
  await assert.rejects(setupAutomation(root, { git: false }), /符号链接越出项目/)
})

test('automation setup adds missing scripts and config without replacing user scripts', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dsh-cordis-automation-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeFile(path.join(root, 'package.json'), `${JSON.stringify({ scripts: { dev: 'user-dev-server' } }, null, 2)}\n`)
  const result = await setupAutomation(root, { git: false })
  const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
  assert.equal(manifest.scripts.dev, 'user-dev-server')
  assert.equal(manifest.scripts['quality:ci'], 'dsh-cordis-kit ci .')
  assert.equal(JSON.parse(await readFile(path.join(root, 'cordis-kit.json'), 'utf8')).automation.mode, 'balanced')
  assert.match(await readFile(path.join(root, '.gitignore'), 'utf8'), /[.]cordis-kit\/reports\//)
  assert.ok(result.notices.some(item => item.includes('scripts.dev')))
})

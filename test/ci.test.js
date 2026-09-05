import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { detectCiProviders, setupCi } from '../lib/ci.js'

test('CI setup generates GitHub, GitLab, Gitee and generic adapters', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dsh-cordis-ci-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ packageManager: 'pnpm@11.13.1' }))
  const result = await setupCi(root, 'all')
  assert.deepEqual(result.providers, ['github', 'gitlab', 'gitee', 'generic'])
  assert.equal(result.manager, 'pnpm')
  assert.match(await readFile(path.join(root, '.github/workflows/cordis-quality.yml'), 'utf8'), /pnpm exec dsh-cordis-kit ci/)
  assert.match(await readFile(path.join(root, '.gitlab-ci.yml'), 'utf8'), /junit\.xml/)
  assert.match(await readFile(path.join(root, '.workflow/MasterPipeline.yml'), 'utf8'), /step: build@nodejs/)
  assert.match(await readFile(path.join(root, '.workflow/BranchPipeline.yml'), 'utf8'), /exclude:\n\s+- main/)
  assert.match(await readFile(path.join(root, '.workflow/PRPipeline.yml'), 'utf8'), /\n  pr:/)
  assert.match(await readFile(path.join(root, '.cordis-kit/ci/README.md'), 'utf8'), /stable non-zero exit code/)
})

test('CI setup never overwrites an existing GitLab pipeline', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dsh-cordis-ci-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeFile(path.join(root, '.gitlab-ci.yml'), 'user-owned: true\n')
  const result = await setupCi(root, 'gitlab')
  assert.equal(await readFile(path.join(root, '.gitlab-ci.yml'), 'utf8'), 'user-owned: true\n')
  assert.match(await readFile(path.join(root, '.cordis-kit/ci/gitlab.include.yml'), 'utf8'), /cordis-quality:/)
  assert.equal(result.notices.length, 1)
})

test('CI auto detection uses repository metadata when no remote exists', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dsh-cordis-ci-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ repository: { url: 'git@gitee.com:team/project.git' } }))
  assert.deepEqual(await detectCiProviders(root), ['gitee'])
})

test('CI commands follow the project package manager', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dsh-cordis-ci-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ packageManager: 'yarn@4.9.2' }))
  const result = await setupCi(root, 'generic')
  assert.equal(result.manager, 'yarn')
  const content = await readFile(path.join(root, '.cordis-kit/ci/README.md'), 'utf8')
  assert.match(content, /yarn install --frozen-lockfile/)
  assert.match(content, /yarn exec dsh-cordis-kit ci/)
})

test('CI setup rejects a directory symlink that escapes the project', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dsh-cordis-ci-'))
  const outside = await mkdtemp(path.join(os.tmpdir(), 'dsh-cordis-ci-outside-'))
  t.after(() => Promise.all([rm(root, { recursive: true, force: true }), rm(outside, { recursive: true, force: true })]))
  await symlink(outside, path.join(root, '.github'), 'junction')
  await assert.rejects(setupCi(root, 'github'), /符号链接越出项目/)
})

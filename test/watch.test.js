import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { isRelevantChange, watchProject } from '../lib/watch.js'

test('watch filter ignores generated and dependency changes', () => {
  assert.equal(isRelevantChange('index.ts'), true)
  assert.equal(isRelevantChange('cordis.patch.yml'), true)
  assert.equal(isRelevantChange('.cordis-kit/reports/result.json'), false)
  assert.equal(isRelevantChange('node_modules/pkg/index.js'), false)
  assert.equal(isRelevantChange('README.md'), false)
})

test('watch runs an initial save checkpoint and can be closed', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dsh-cordis-watch-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  let calls = 0
  const controller = await watchProject(root, { debounceMs: 100, execute: () => ({ passed: true, calls: ++calls }) })
  controller.close()
  assert.equal(calls, 1)
})

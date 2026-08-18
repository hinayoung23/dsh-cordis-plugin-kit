import assert from 'node:assert/strict'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { checkProject } from '../lib/checker.js'

const fixtures = fileURLToPath(new URL('./fixtures/', import.meta.url))

test('valid Cordis bundle passes strict static checks', async () => {
  const report = await checkProject(`${fixtures}/good`, { strict: true })
  assert.equal(report.passed, true, JSON.stringify(report.diagnostics, null, 2))
  assert.deepEqual(report.summary, { errors: 0, warnings: 0, infos: 0 })
})

test('invalid project reports manifest, Cordis, lifecycle and security failures', async () => {
  const report = await checkProject(`${fixtures}/bad`)
  const rules = new Set(report.diagnostics.map(item => item.ruleId))
  for (const expected of ['PKG001', 'PKG003', 'DSH001', 'DSH002', 'DSH003', 'CRD003', 'CRD006', 'CRD008', 'CRD010', 'CRD011', 'TOOL001', 'SEC001', 'SEC002', 'PERF002']) {
    assert.equal(rules.has(expected), true, `missing ${expected}: ${JSON.stringify(report.diagnostics, null, 2)}`)
  }
  assert.equal(report.passed, false)
  assert.ok(report.summary.errors >= 8)
})

test('missing package.json fails without scanning outside the target', async () => {
  const report = await checkProject(`${fixtures}/missing`)
  assert.equal(report.passed, false)
  assert.equal(report.diagnostics[0].ruleId, 'PKG001')
})

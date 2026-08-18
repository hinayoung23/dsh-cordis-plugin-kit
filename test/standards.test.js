import assert from 'node:assert/strict'
import test from 'node:test'
import { getStandards, STANDARD_VERSION } from '../lib/standards.js'

test('offline standard has unique stable rule ids and defensive copies', () => {
  const first = getStandards()
  const second = getStandards()
  assert.match(STANDARD_VERSION, /^\d{4}[.]\d{2}$/)
  assert.ok(first.length >= 30)
  assert.equal(new Set(first.map(rule => rule.id)).size, first.length)
  first[0].requirement = 'changed by caller'
  assert.notEqual(second[0].requirement, first[0].requirement)
})

test('standard covers Cordis-specific lifecycle, injection, events and config', () => {
  const ids = new Set(getStandards().map(rule => rule.id))
  for (const id of ['CRD003', 'CRD006', 'CRD008', 'CRD011', 'CRD012', 'CRD013']) assert.equal(ids.has(id), true)
})

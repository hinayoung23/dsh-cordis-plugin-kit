import assert from 'node:assert/strict'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { evaluatePerformance, runtimeCheck } from '../lib/runtime.js'

const root = fileURLToPath(new URL('../', import.meta.url))
const fixtures = fileURLToPath(new URL('./fixtures/', import.meta.url))

test('runtime check uses real Cordis and measures repeated apply/dispose', async () => {
  const runtime = await runtimeCheck(root, { iterations: 10, timeoutMs: 10_000 })
  const evaluation = evaluatePerformance(runtime)
  assert.equal(runtime.result.state, 'ACTIVE')
  assert.equal(runtime.result.iterations, 10)
  assert.equal(evaluation.passed, true, evaluation.failures.join('\n'))
})

test('runtime check exposes PENDING when an injected service is absent', async () => {
  const runtime = await runtimeCheck(`${fixtures}/pending`, { iterations: 1, timeoutMs: 10_000 })
  const evaluation = evaluatePerformance(runtime)
  assert.equal(runtime.result.state, 'PENDING')
  assert.equal(runtime.result.iterations, 0)
  assert.equal(evaluation.passed, false)
  assert.match(evaluation.failures.join('\n'), /Fiber 状态为 PENDING/)
})

test('runtime check terminates a plugin whose apply never settles', async () => {
  const runtime = await runtimeCheck(`${fixtures}/slow`, { iterations: 1, timeoutMs: 300 })
  assert.equal(runtime.timedOut, true)
  assert.equal(runtime.result, undefined)
})

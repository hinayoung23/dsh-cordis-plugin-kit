import assert from 'node:assert/strict'
import test from 'node:test'
import { apply, name } from '../index.js'

test('DSH plugin provides the kit service through a lifecycle-owned registration', async () => {
  const services = new Map()
  const disposers = []
  const ctx = {
    provide(key, value) {
      services.set(key, value)
      const dispose = () => services.delete(key)
      disposers.push(dispose)
      return dispose
    },
  }
  apply(ctx)
  assert.equal(name, 'dsh-cordis-plugin-kit')
  assert.equal(services.get('cordisPluginKit').version, '2026.08')
  assert.equal(typeof services.get('cordisPluginKit').check, 'function')
  assert.equal(typeof services.get('cordisPluginKit').quality, 'function')
  for (const dispose of disposers.reverse()) await dispose()
  assert.equal(services.size, 0)
})

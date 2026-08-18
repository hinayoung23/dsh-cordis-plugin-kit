import { readFile, realpath } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { performance } from 'node:perf_hooks'

const STATE_NAMES = ['PENDING', 'LOADING', 'ACTIVE', 'FAILED', 'DISPOSED', 'UNLOADING']
const RESULT_MARKER = 'CORDIS_KIT_RESULT='

function percentile(values, ratio) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)]
}

function round(value) {
  return Math.round(value * 1000) / 1000
}

function stubService() {
  const target = () => proxy
  const proxy = new Proxy(target, {
    get(_target, property) {
      if (property === 'then') return undefined
      if (property === Symbol.toPrimitive) return () => 'cordis-kit-stub'
      return proxy
    },
    apply() {
      return proxy
    },
  })
  return proxy
}

function pluginFromModule(namespace) {
  if (namespace.default !== undefined) return namespace.default
  if (typeof namespace.apply !== 'function') throw new Error('module does not export apply or a default plugin')
  return {
    name: namespace.name,
    inject: namespace.inject,
    Config: namespace.Config,
    provide: namespace.provide,
    intercept: namespace.intercept,
    apply: namespace.apply,
  }
}

async function main() {
  const payload = JSON.parse(process.argv[2])
  const manifestPath = path.join(payload.root, 'package.json')
  await readFile(manifestPath, 'utf8')
  const requireFromProject = createRequire(manifestPath)
  const cordisEntry = requireFromProject.resolve('@deepseek-ai/cordis')
  const { Context } = await import(pathToFileURL(cordisEntry).href)
  const root = await realpath(payload.root)
  const entry = await realpath(path.resolve(root, payload.entry))
  const relativeEntry = path.relative(root, entry)
  if (relativeEntry.startsWith('..') || path.isAbsolute(relativeEntry)) throw new Error('entry must stay inside project root')
  const namespace = await import(`${pathToFileURL(entry).href}?cordis-kit=${Date.now()}`)
  const plugin = pluginFromModule(namespace)
  const context = new Context()
  for (const service of payload.provide) {
    if (typeof service !== 'string' || !/^[A-Za-z_$][\w$-]*$/.test(service)) throw new Error(`invalid provided service: ${service}`)
    context.provide(service, stubService())
  }
  global.gc?.()
  const heapBefore = process.memoryUsage().heapUsed
  const applyTimes = []
  const disposeTimes = []
  let state = 'UNKNOWN'
  for (let index = 0; index < payload.iterations; index += 1) {
    const applyStarted = performance.now()
    const fiber = context.plugin(plugin, payload.config)
    await fiber
    applyTimes.push(performance.now() - applyStarted)
    state = STATE_NAMES[fiber.state] ?? String(fiber.state)
    if (state !== 'ACTIVE') break
    const disposeStarted = performance.now()
    await fiber.dispose()
    disposeTimes.push(performance.now() - disposeStarted)
  }
  global.gc?.()
  const heapAfter = process.memoryUsage().heapUsed
  await context.fiber.dispose()
  const result = {
    state,
    iterations: disposeTimes.length,
    applyP50Ms: round(percentile(applyTimes, 0.5)),
    applyP95Ms: round(percentile(applyTimes, 0.95)),
    disposeP50Ms: round(percentile(disposeTimes, 0.5)),
    disposeP95Ms: round(percentile(disposeTimes, 0.95)),
    heapGrowthKb: round(Math.max(0, heapAfter - heapBefore) / 1024),
  }
  process.stdout.write(`${RESULT_MARKER}${JSON.stringify(result)}\n`)
}

main().catch(error => {
  process.stderr.write(`${error.stack ?? error.message}\n`)
  process.exitCode = 1
})

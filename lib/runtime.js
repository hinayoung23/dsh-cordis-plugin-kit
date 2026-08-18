import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runChild } from './process.js'

const runner = fileURLToPath(new URL('../runner/runtime-smoke.js', import.meta.url))
const RESULT_MARKER = 'CORDIS_KIT_RESULT='

async function readJson(filename, fallback) {
  try {
    return JSON.parse(await readFile(filename, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return fallback
    throw new Error(`无法读取 ${filename}：${error.message}`)
  }
}

export async function runtimeCheck(projectPath, options = {}) {
  const root = path.resolve(projectPath)
  const kitConfig = await readJson(path.join(root, 'cordis-kit.json'), {})
  let runtimeConfig = kitConfig.config ?? {}
  if (options.configFile) {
    const absoluteConfig = path.resolve(root, options.configFile)
    if (path.relative(root, absoluteConfig).startsWith('..')) throw new Error('配置文件必须位于项目目录内。')
    runtimeConfig = await readJson(absoluteConfig, {})
  }
  const performance = kitConfig.performance ?? {}
  const payload = {
    root,
    entry: options.entry ?? kitConfig.entry ?? './index.js',
    config: runtimeConfig,
    provide: options.provide ?? kitConfig.provide ?? [],
    iterations: Math.min(1000, Math.max(1, Number(options.iterations ?? performance.iterations) || 1)),
  }
  const execution = await runChild(process.execPath, ['--expose-gc', runner, JSON.stringify(payload)], {
    cwd: root,
    timeoutMs: options.timeoutMs ?? 30_000,
    maxOutputBytes: 2 * 1024 * 1024,
  })
  const markerIndex = execution.output.lastIndexOf(RESULT_MARKER)
  let result
  if (markerIndex >= 0) {
    const line = execution.output.slice(markerIndex + RESULT_MARKER.length).split('\n')[0]
    try {
      result = JSON.parse(line)
    } catch {}
  }
  return {
    ...execution,
    logs: markerIndex >= 0 ? execution.output.slice(0, markerIndex).trim() : execution.output.trim(),
    result,
    budgets: {
      maxApplyP95Ms: Number(options.maxApplyMs ?? performance.maxApplyP95Ms) || 50,
      maxDisposeP95Ms: Number(options.maxDisposeMs ?? performance.maxDisposeP95Ms) || 50,
      maxHeapGrowthKb: Number(options.maxHeapKb ?? performance.maxHeapGrowthKb) || 1024,
    },
  }
}

export function evaluatePerformance(runtime) {
  const failures = []
  if (runtime.timedOut) failures.push('运行时检查超时')
  if (runtime.code !== 0) failures.push(`运行时子进程退出码为 ${runtime.code}`)
  if (!runtime.result) failures.push('运行时未返回结构化结果')
  if (runtime.result?.state !== 'ACTIVE') failures.push(`Fiber 状态为 ${runtime.result?.state ?? 'UNKNOWN'}`)
  if (runtime.result?.applyP95Ms > runtime.budgets.maxApplyP95Ms) failures.push(`apply p95 ${runtime.result.applyP95Ms}ms 超过 ${runtime.budgets.maxApplyP95Ms}ms`)
  if (runtime.result?.disposeP95Ms > runtime.budgets.maxDisposeP95Ms) failures.push(`dispose p95 ${runtime.result.disposeP95Ms}ms 超过 ${runtime.budgets.maxDisposeP95Ms}ms`)
  if (runtime.result?.heapGrowthKb > runtime.budgets.maxHeapGrowthKb) failures.push(`堆增长 ${runtime.result.heapGrowthKb}KB 超过 ${runtime.budgets.maxHeapGrowthKb}KB`)
  return { passed: failures.length === 0, failures }
}

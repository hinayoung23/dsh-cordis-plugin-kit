#!/usr/bin/env node
import { parseArgs } from 'node:util'
import { checkProject } from '../lib/checker.js'
import { detectPackageManager, runChild } from '../lib/process.js'
import { formatCheckReport, formatStandards } from '../lib/report.js'
import { evaluatePerformance, runtimeCheck } from '../lib/runtime.js'
import { scaffoldProject } from '../lib/scaffold.js'
import { getStandards, STANDARD_VERSION } from '../lib/standards.js'

const VERSION = '0.1.0'

const help = `dsh-cordis-kit ${VERSION}

用法：
  dsh-cordis-kit init <directory> [--name package-name]
  dsh-cordis-kit standards [--category cordis] [--json]
  dsh-cordis-kit check [directory] [--strict] [--json]
  dsh-cordis-kit test [directory] [--strict] [--timeout 30000]
  dsh-cordis-kit debug [directory] [--config file] [--provide a,b] [--timeout 30000] [--json]
  dsh-cordis-kit perf [directory] [--iterations 30] [--max-apply-ms 50]
                       [--max-dispose-ms 50] [--max-heap-kb 1024] [--json]

命令说明：
  init       创建带测试、质量门和 DSH bundle manifest 的插件项目
  standards  查看内置的离线 Cordis/DSH 开发规范
  check      只读静态检查，不执行目标插件代码
  test       静态检查通过后，使用项目现有包管理器运行测试
  debug      在有超时限制的子进程中执行一次真实 Cordis apply/dispose
  perf       重复执行 apply/dispose 并验证 p95 延迟和堆增长预算
`

function commonOptions(extra = {}) {
  return {
    help: { type: 'boolean', short: 'h' },
    json: { type: 'boolean' },
    ...extra,
  }
}

function parse(commandArgs, options) {
  return parseArgs({ args: commandArgs, allowPositionals: true, strict: true, options })
}

function list(value) {
  if (!value) return undefined
  return value.split(',').map(item => item.trim()).filter(Boolean)
}

function number(value, label) {
  if (value === undefined) return undefined
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${label} 必须是正数。`)
  return parsed
}

async function commandInit(args) {
  const { values, positionals } = parse(args, commonOptions({ name: { type: 'string' } }))
  if (values.help) return console.log(help)
  if (positionals.length !== 1) throw new Error('init 需要一个目标目录。')
  const result = await scaffoldProject(positionals[0], { name: values.name })
  console.log(`已创建 ${result.packageName}：${result.root}`)
  console.log(`生成 ${result.files.length} 个文件。下一步：cd ${positionals[0]} && pnpm install && pnpm check`)
}

async function commandStandards(args) {
  const { values, positionals } = parse(args, commonOptions({ category: { type: 'string' } }))
  if (values.help) return console.log(help)
  if (positionals.length > 0) throw new Error('standards 不接受位置参数。')
  let rules = getStandards()
  if (values.category) rules = rules.filter(rule => rule.category === values.category || rule.id.toLowerCase().startsWith(values.category.toLowerCase()))
  if (values.json) console.log(JSON.stringify({ version: STANDARD_VERSION, rules }, null, 2))
  else console.log(`Cordis/DSH offline standard ${STANDARD_VERSION}\n${formatStandards(rules)}`)
}

async function commandCheck(args) {
  const { values, positionals } = parse(args, commonOptions({
    strict: { type: 'boolean' },
    'max-files': { type: 'string' },
    'max-file-bytes': { type: 'string' },
  }))
  if (values.help) return console.log(help)
  if (positionals.length > 1) throw new Error('check 最多接受一个项目目录。')
  const report = await checkProject(positionals[0] ?? '.', {
    strict: values.strict,
    maxFiles: number(values['max-files'], 'max-files'),
    maxFileBytes: number(values['max-file-bytes'], 'max-file-bytes'),
  })
  console.log(values.json ? JSON.stringify(report, null, 2) : formatCheckReport(report))
  if (!report.passed) process.exitCode = 1
  return report
}

async function commandTest(args) {
  const { values, positionals } = parse(args, commonOptions({
    strict: { type: 'boolean' },
    timeout: { type: 'string' },
  }))
  if (values.help) return console.log(help)
  if (positionals.length > 1) throw new Error('test 最多接受一个项目目录。')
  const root = positionals[0] ?? '.'
  const report = await checkProject(root, { strict: values.strict })
  console.log(formatCheckReport(report))
  if (!report.passed) {
    process.exitCode = 1
    return
  }
  const manager = await detectPackageManager(report.root)
  console.log(`运行：${manager.command} ${manager.args.join(' ')}`)
  const execution = await runChild(manager.command, manager.args, { cwd: report.root, timeoutMs: number(values.timeout, 'timeout') })
  if (execution.output) process.stdout.write(execution.output)
  if (execution.timedOut) console.error('测试超时，子进程已终止。')
  if (execution.truncated) console.error('测试输出超过限制，已截断。')
  if (execution.code !== 0 || execution.timedOut) process.exitCode = 1
}

function runtimeOptions(values) {
  return {
    configFile: values.config,
    provide: list(values.provide),
    timeoutMs: number(values.timeout, 'timeout'),
    iterations: number(values.iterations, 'iterations'),
    maxApplyMs: number(values['max-apply-ms'], 'max-apply-ms'),
    maxDisposeMs: number(values['max-dispose-ms'], 'max-dispose-ms'),
    maxHeapKb: number(values['max-heap-kb'], 'max-heap-kb'),
  }
}

async function runRuntimeCommand(args, mode) {
  const { values, positionals } = parse(args, commonOptions({
    strict: { type: 'boolean' },
    config: { type: 'string' },
    provide: { type: 'string' },
    timeout: { type: 'string' },
    iterations: { type: 'string' },
    'max-apply-ms': { type: 'string' },
    'max-dispose-ms': { type: 'string' },
    'max-heap-kb': { type: 'string' },
  }))
  if (values.help) return console.log(help)
  if (positionals.length > 1) throw new Error(`${mode} 最多接受一个项目目录。`)
  const root = positionals[0] ?? '.'
  const report = await checkProject(root, { strict: values.strict })
  if (report.summary.errors > 0) {
    console.log(values.json ? JSON.stringify({ check: report }, null, 2) : formatCheckReport(report))
    process.exitCode = 1
    return
  }
  const options = runtimeOptions(values)
  if (mode === 'debug') options.iterations = 1
  const runtime = await runtimeCheck(report.root, options)
  const evaluation = evaluatePerformance(runtime)
  const payload = { check: report, runtime: runtime.result, budgets: runtime.budgets, failures: evaluation.failures, logs: runtime.logs }
  if (values.json) {
    console.log(JSON.stringify(payload, null, 2))
  } else {
    console.log(formatCheckReport(report))
    if (runtime.logs) console.log(`\n插件日志：\n${runtime.logs}`)
    if (runtime.result) {
      const result = runtime.result
      console.log(`\nFiber=${result.state} iterations=${result.iterations} apply(p50/p95)=${result.applyP50Ms}/${result.applyP95Ms}ms dispose(p50/p95)=${result.disposeP50Ms}/${result.disposeP95Ms}ms heapGrowth=${result.heapGrowthKb}KB`)
    }
    if (evaluation.passed) console.log(`${mode === 'perf' ? '性能门' : '运行时调试'}：PASS`)
    else console.error(`${mode === 'perf' ? '性能门' : '运行时调试'}：FAIL\n- ${evaluation.failures.join('\n- ')}`)
  }
  if (!evaluation.passed) process.exitCode = 1
}

async function main() {
  const [command, ...args] = process.argv.slice(2)
  if (!command || command === 'help' || command === '--help' || command === '-h') return console.log(help)
  if (command === '--version' || command === '-v' || command === 'version') return console.log(VERSION)
  if (command === 'init') return commandInit(args)
  if (command === 'standards') return commandStandards(args)
  if (command === 'check') return commandCheck(args)
  if (command === 'test') return commandTest(args)
  if (command === 'debug') return runRuntimeCommand(args, 'debug')
  if (command === 'perf') return runRuntimeCommand(args, 'perf')
  throw new Error(`未知命令：${command}\n\n${help}`)
}

main().catch(error => {
  console.error(`dsh-cordis-kit: ${error.message}`)
  process.exitCode = 1
})

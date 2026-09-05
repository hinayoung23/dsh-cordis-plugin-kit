import path from 'node:path'
import { checkProject } from './checker.js'
import { detectPackageManager, runChild } from './process.js'
import { writeQualityReports } from './reports.js'
import { evaluatePerformance, runtimeCheck } from './runtime.js'

export const KIT_VERSION = '0.2.1'
export const CHECKPOINTS = Object.freeze(['save', 'pre-commit', 'pre-push', 'release', 'ci'])

const CHECKPOINT_STAGES = Object.freeze({
  save: ['static'],
  'pre-commit': ['static', 'test'],
  'pre-push': ['static', 'test', 'runtime'],
  release: ['static', 'test', 'runtime', 'performance', 'package'],
  ci: ['static', 'test', 'runtime', 'performance', 'package'],
})

function stage(name, started, status, summary, extra = {}) {
  return { name, status, durationMs: Math.max(0, Date.now() - started), summary, ...extra }
}

function ciProvider(env = process.env) {
  if (env.GITHUB_ACTIONS === 'true') return 'github'
  if (env.GITLAB_CI === 'true') return 'gitlab'
  if (env.GITEE_PIPELINE_ID || env.GITEE_REPO) return 'gitee'
  if (env.CI) return 'generic'
  return 'local'
}

async function testStage(root, timeoutMs) {
  const started = Date.now()
  const manager = await detectPackageManager(root)
  const execution = await runChild(manager.command, manager.args, { cwd: root, timeoutMs })
  const passed = execution.code === 0 && !execution.timedOut
  return stage('test', started, passed ? 'passed' : 'failed', passed ? `${manager.name} tests passed` : `${manager.name} tests failed`, execution)
}

async function runtimeStage(root, iterations, options) {
  const started = Date.now()
  const runtime = await runtimeCheck(root, { ...options, iterations })
  const evaluation = evaluatePerformance(runtime)
  const actualIterations = runtime.result?.iterations ?? iterations ?? 0
  return stage(iterations === 1 ? 'runtime' : 'performance', started, evaluation.passed ? 'passed' : 'failed',
    evaluation.passed ? `Cordis apply/dispose passed (${actualIterations} iteration${actualIterations === 1 ? '' : 's'})` : evaluation.failures.join('; '), {
      failures: evaluation.failures,
      runtime: runtime.result,
      budgets: runtime.budgets,
      output: runtime.logs,
      timedOut: runtime.timedOut,
      truncated: runtime.truncated,
      code: runtime.code,
    })
}

async function packageStage(root, timeoutMs) {
  const started = Date.now()
  const execution = await runChild('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: root, timeoutMs })
  const passed = execution.code === 0 && !execution.timedOut
  return stage('package', started, passed ? 'passed' : 'failed', passed ? 'npm package dry-run passed' : 'npm package dry-run failed', execution)
}

export async function runQuality(projectPath = '.', checkpoint = 'ci', options = {}) {
  if (!CHECKPOINTS.includes(checkpoint)) throw new Error(`未知检查点：${checkpoint}`)
  const root = path.resolve(projectPath)
  const result = {
    kitVersion: KIT_VERSION,
    checkpoint,
    root,
    provider: ciProvider(options.env),
    startedAt: new Date().toISOString(),
    passed: false,
    stages: [],
  }
  const selected = CHECKPOINT_STAGES[checkpoint].filter(name => !(name === 'package' && options.skipPackage))
  const checkStarted = Date.now()
  const check = await checkProject(root, { strict: checkpoint !== 'save' })
  result.check = check
  result.stages.push(stage('static', checkStarted, check.passed ? 'passed' : 'failed',
    `${check.summary.errors} error(s), ${check.summary.warnings} warning(s)`))

  if (check.passed) {
    for (const name of selected.slice(1)) {
      let current
      if (name === 'test') current = await testStage(root, options.timeoutMs)
      else if (name === 'runtime') current = await runtimeStage(root, 1, options)
      else if (name === 'performance') current = await runtimeStage(root, options.iterations, options)
      else if (name === 'package') current = await packageStage(root, options.timeoutMs)
      result.stages.push(current)
      if (current.status === 'failed') break
    }
  } else {
    for (const name of selected.slice(1)) result.stages.push(stage(name, Date.now(), 'skipped', 'blocked by static checks'))
  }
  result.finishedAt = new Date().toISOString()
  result.passed = result.stages.every(item => item.status === 'passed' || item.status === 'skipped')
    && result.stages.every(item => item.status !== 'failed')
  if (options.reports !== false) result.reports = await writeQualityReports(result, { directory: options.reportDirectory })
  return result
}

export function formatQualityResult(result) {
  const lines = [`Cordis quality ${result.checkpoint} [${result.provider}]`]
  for (const item of result.stages) lines.push(`${item.status === 'passed' ? 'PASS' : item.status === 'skipped' ? 'SKIP' : 'FAIL'} ${item.name} (${item.durationMs}ms) ${item.summary}`)
  if (result.reports) lines.push(`Reports: ${path.relative(result.root, path.dirname(result.reports.json))}`)
  lines.push(result.passed ? 'Quality gate: PASS' : 'Quality gate: FAIL')
  return lines.join('\n')
}

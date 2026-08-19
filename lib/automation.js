import { access, chmod, lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import path from 'node:path'
import { runChild } from './process.js'

async function exists(filename) {
  try {
    await access(filename, constants.F_OK)
    return true
  } catch {
    return false
  }
}

const HOOKS = Object.freeze({
  'pre-commit': `#!/bin/sh
exec pnpm exec dsh-cordis-kit checkpoint pre-commit .
`,
  'pre-push': `#!/bin/sh
exec pnpm exec dsh-cordis-kit checkpoint pre-push .
`,
})

const SCRIPTS = Object.freeze({
  dev: 'dsh-cordis-kit watch .',
  'quality:save': 'dsh-cordis-kit checkpoint save .',
  'quality:commit': 'dsh-cordis-kit checkpoint pre-commit .',
  'quality:push': 'dsh-cordis-kit checkpoint pre-push .',
  'quality:ci': 'dsh-cordis-kit ci .',
  prepack: 'dsh-cordis-kit checkpoint release . --skip-package',
})

export function agentInstructions() {
  return `# Cordis plugin quality automation

- Follow \`cordis-kit.json\` and the bundled rules available through \`pnpm exec dsh-cordis-kit standards\`.
- After editing plugin source, tests, package metadata, the DSH patch, or runtime config, run \`pnpm exec dsh-cordis-kit checkpoint save .\`.
- After lifecycle, service injection, configuration, event, or resource-management changes, run \`pnpm exec dsh-cordis-kit checkpoint pre-push .\`.
- Before handing work to the user, run \`pnpm exec dsh-cordis-kit checkpoint pre-commit .\`; use \`pnpm quality:ci\` for release-ready work.
- Do not bypass a failed gate. Report the failing stage and preserve \`.cordis-kit/reports\` for diagnosis.
`
}

async function gitTopLevel(root) {
  const result = await runChild('git', ['rev-parse', '--show-toplevel'], { cwd: root, timeoutMs: 5000 })
  return result.code === 0 ? result.output.trim() : undefined
}

async function ordinaryFile(filename, required = false) {
  try {
    const info = await lstat(filename)
    if (info.isSymbolicLink() || !info.isFile()) throw new Error(`必须是普通文件：${filename}`)
    return true
  } catch (error) {
    if (!required && error.code === 'ENOENT') return false
    throw error
  }
}

async function configureProject(root, result, options) {
  const manifestPath = path.join(root, 'package.json')
  await ordinaryFile(manifestPath, true)
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  manifest.scripts ??= {}
  let manifestChanged = false
  for (const [name, command] of Object.entries(SCRIPTS)) {
    if (manifest.scripts[name] === undefined) {
      manifest.scripts[name] = command
      result.scriptsAdded.push(name)
      manifestChanged = true
    } else if (manifest.scripts[name] !== command) {
      result.notices.push(`保留已有 package.json scripts.${name}，请确认它覆盖等价质量门。`)
    }
  }
  if (manifestChanged) {
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
    result.filesUpdated.push('package.json')
  }

  const configPath = path.join(root, 'cordis-kit.json')
  const hasConfig = await ordinaryFile(configPath)
  const config = hasConfig ? JSON.parse(await readFile(configPath, 'utf8')) : {}
  if (config.automation === undefined) {
    config.automation = { mode: 'balanced', debounceMs: 800, ci: options.ci ?? 'auto' }
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
    result.filesUpdated.push('cordis-kit.json')
  }

  const ignorePath = path.join(root, '.gitignore')
  const hasIgnore = await ordinaryFile(ignorePath)
  const ignore = hasIgnore ? await readFile(ignorePath, 'utf8') : ''
  if (!ignore.split(/\r?\n/).includes('.cordis-kit/reports/')) {
    await writeFile(ignorePath, `${ignore}${ignore && !ignore.endsWith('\n') ? '\n' : ''}.cordis-kit/reports/\n`, 'utf8')
    result.filesUpdated.push('.gitignore')
  }
}

export async function setupAutomation(projectPath = '.', options = {}) {
  const root = path.resolve(projectPath)
  const result = { root, hooks: [], scriptsAdded: [], filesUpdated: [], gitInitialized: false, hookPathConfigured: false, notices: [] }
  if (options.configure !== false) await configureProject(root, result, options)
  const hookDirectory = path.join(root, '.githooks')
  await mkdir(hookDirectory, { recursive: true })
  const [realRoot, realHookDirectory] = await Promise.all([realpath(root), realpath(hookDirectory)])
  const hookRelative = path.relative(realRoot, realHookDirectory)
  if (hookRelative.startsWith('..') || path.isAbsolute(hookRelative)) throw new Error('Git hooks 目录不得通过符号链接越出项目。')
  for (const [name, content] of Object.entries(HOOKS)) {
    const filename = path.join(realHookDirectory, name)
    if (!await exists(filename)) await writeFile(filename, content, { encoding: 'utf8', flag: 'wx' })
    const info = await lstat(filename)
    if (info.isSymbolicLink() || !info.isFile()) throw new Error(`Git hook 必须是普通文件：${name}`)
    await chmod(filename, 0o755)
    result.hooks.push(`.githooks/${name}`)
  }

  if (!await exists(path.join(root, 'AGENTS.md'))) await writeFile(path.join(root, 'AGENTS.md'), agentInstructions(), { encoding: 'utf8', flag: 'wx' })
  if (options.git === false) return result

  let topLevel = await gitTopLevel(root)
  if (!topLevel) {
    const initialized = await runChild('git', ['init', '-b', 'main'], { cwd: root, timeoutMs: 10_000 })
    if (initialized.code !== 0) {
      result.notices.push(`无法初始化 Git：${initialized.output.trim()}`)
      return result
    }
    result.gitInitialized = true
    topLevel = await gitTopLevel(root)
  }
  const realTopLevel = await realpath(topLevel)
  if (realTopLevel !== realRoot) {
    result.notices.push('目标目录位于另一个 Git 仓库内，未修改父仓库的 hooksPath。')
    return result
  }
  const configured = await runChild('git', ['config', '--get', 'core.hooksPath'], { cwd: root, timeoutMs: 5000 })
  const current = configured.code === 0 ? configured.output.trim() : ''
  if (current && current !== '.githooks') {
    result.notices.push(`core.hooksPath 已设置为 ${current}，未覆盖；请合并 .githooks 中的检查。`)
    return result
  }
  const set = await runChild('git', ['config', 'core.hooksPath', '.githooks'], { cwd: root, timeoutMs: 5000 })
  if (set.code === 0) result.hookPathConfigured = true
  else result.notices.push(`无法配置 Git hooksPath：${set.output.trim()}`)
  return result
}

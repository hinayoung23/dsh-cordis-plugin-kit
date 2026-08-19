import { lstat, readFile, readdir, realpath } from 'node:fs/promises'
import path from 'node:path'
import { STANDARD_VERSION } from './standards.js'

const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts', '.tsx', '.jsx'])
const IGNORED_DIRECTORIES = new Set(['.git', 'node_modules', 'coverage', 'dist', 'build', '.next', '.cache'])
const CONTEXT_BUILTINS = new Set([
  'bail', 'baseUrl', 'effect', 'emit', 'events', 'fiber', 'get', 'inject', 'intercept',
  'isolate', 'logger', 'on', 'once', 'parallel', 'plugin', 'provide', 'reflect',
  'registry', 'root', 'serial', 'waterfall',
])
const SECRET_FILE = /(?:^|\/)(?:[.]env(?:[.]|$)|id_rsa$|id_ed25519$|.*[.](?:pem|p12|pfx|key)$)/i
const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 }

function maskNonCode(source) {
  const chars = [...source]
  const masked = [...chars]
  const blank = index => {
    if (chars[index] !== '\n' && chars[index] !== '\r') masked[index] = ' '
  }
  let index = 0
  while (index < chars.length) {
    const char = chars[index]
    const next = chars[index + 1]
    if (char === '/' && next === '/') {
      blank(index++)
      blank(index++)
      while (index < chars.length && chars[index] !== '\n') blank(index++)
      continue
    }
    if (char === '/' && next === '*') {
      blank(index++)
      blank(index++)
      while (index < chars.length) {
        if (chars[index] === '*' && chars[index + 1] === '/') {
          blank(index++)
          blank(index++)
          break
        }
        blank(index++)
      }
      continue
    }
    if (char === "'" || char === '"' || char === '`') {
      const quote = char
      blank(index++)
      while (index < chars.length) {
        if (chars[index] === '\\') {
          blank(index++)
          if (index < chars.length) blank(index++)
          continue
        }
        const closing = chars[index] === quote
        blank(index++)
        if (closing) break
      }
      continue
    }
    if (char === '/') {
      let previous = index - 1
      while (previous >= 0 && /\s/.test(chars[previous])) previous -= 1
      if (previous < 0 || /[=(:,!&|?[{;]/.test(chars[previous])) {
        blank(index++)
        let inClass = false
        while (index < chars.length) {
          if (chars[index] === '\\') {
            blank(index++)
            if (index < chars.length) blank(index++)
            continue
          }
          if (chars[index] === '[') inClass = true
          if (chars[index] === ']') inClass = false
          const closing = chars[index] === '/' && !inClass
          blank(index++)
          if (closing) {
            while (index < chars.length && /[a-z]/i.test(chars[index])) blank(index++)
            break
          }
        }
        continue
      }
    }
    index += 1
  }
  return masked.join('')
}

function locationOf(source, index) {
  return source.slice(0, Math.max(0, index)).split('\n').length
}

function add(report, ruleId, severity, message, file, line, detail) {
  report.diagnostics.push({ ruleId, severity, message, ...(file ? { file } : {}), ...(line ? { line } : {}), ...(detail ? { detail } : {}) })
}

function projectFile(root, filename) {
  const resolved = path.resolve(root, filename)
  const relative = path.relative(root, resolved)
  if (relative.startsWith('..') || path.isAbsolute(relative)) return undefined
  return resolved
}

async function existingProjectFile(root, filename) {
  const resolved = projectFile(root, filename)
  if (resolved === undefined) return undefined
  try {
    const info = await lstat(resolved)
    if (info.isSymbolicLink()) {
      const target = await realpath(resolved)
      if (projectFile(root, path.relative(root, target)) === undefined) return undefined
    }
    return info.isFile() || info.isSymbolicLink() ? resolved : undefined
  } catch {
    return undefined
  }
}

function ignoredSource(relative, patterns) {
  const normalized = relative.split(path.sep).join('/')
  return patterns.some(pattern => {
    const value = String(pattern).replace(/^\.\//, '').replaceAll('\\', '/')
    if (value.endsWith('/**')) return normalized === value.slice(0, -3) || normalized.startsWith(value.slice(0, -2))
    return normalized === value
  })
}

async function collectSourceFiles(root, limits, report, ignorePatterns) {
  const result = []
  const queue = [root]
  while (queue.length > 0 && result.length < limits.maxFiles) {
    const directory = queue.shift()
    let entries
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (result.length >= limits.maxFiles) break
      if (entry.isSymbolicLink()) continue
      const absolute = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) queue.push(absolute)
        continue
      }
      if (!entry.isFile() || !SOURCE_EXTENSIONS.has(path.extname(entry.name))) continue
      const relative = path.relative(root, absolute)
      if (ignoredSource(relative, ignorePatterns)) continue
      try {
        const info = await lstat(absolute)
        if (info.size > limits.maxFileBytes) {
          add(report, 'PERF001', 'warning', `跳过超过 ${limits.maxFileBytes} 字节的源码文件。`, path.relative(root, absolute))
          continue
        }
        const source = await readFile(absolute, 'utf8')
        if (!source.includes('\0')) result.push({ absolute, file: relative, source, code: maskNonCode(source), size: info.size })
      } catch {
        // Concurrent edits can remove files during a check; the next run will see the stable state.
      }
    }
  }
  if (result.length >= limits.maxFiles) {
    add(report, 'PERF001', 'warning', `源码扫描达到 ${limits.maxFiles} 个文件上限，结果可能不完整。`)
  }
  return result
}

function parseInjectedServices(source) {
  const services = new Set()
  const declaration = /(?:export\s+const|static)\s+inject\s*=\s*\[([^\]]*)\]/g
  for (const match of source.matchAll(declaration)) {
    for (const value of match[1].matchAll(/['"]([A-Za-z_$][\w$-]*)['"]/g)) services.add(value[1])
  }
  const objectDeclaration = /(?:export\s+const|static)\s+inject\s*=\s*\{([^}]*)\}/g
  for (const match of source.matchAll(objectDeclaration)) {
    for (const value of match[1].matchAll(/(?:^|,)\s*['"]?([A-Za-z_$][\w$-]*)['"]?\s*:/g)) services.add(value[1])
  }
  return services
}

function checkManifest(report, root, manifest) {
  if (manifest.type !== 'module') add(report, 'PKG001', 'error', 'package.json 必须声明 "type": "module"。', 'package.json')
  if (typeof manifest.name !== 'string' || !/^(?:@[a-z0-9._-]+\/)?[a-z0-9][a-z0-9._-]*$/.test(manifest.name)) {
    add(report, 'PKG001', 'error', 'package name 缺失或不符合 npm 命名规则。', 'package.json')
  }
  if (typeof manifest.version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(manifest.version)) {
    add(report, 'PKG001', 'error', 'package version 必须使用语义化版本。', 'package.json')
  }
  if (typeof manifest.main !== 'string') add(report, 'PKG001', 'error', 'package.json 必须声明 main 入口。', 'package.json')
  if (manifest.engines?.node === undefined || !/(?:>=|\^)?(?:22|2[3-9]|[3-9]\d)/.test(String(manifest.engines.node))) {
    add(report, 'PKG004', 'warning', '建议声明 engines.node >=22，与 DSH/Cordis 当前运行基线一致。', 'package.json')
  }
  for (const [field, present] of [
    ['license', typeof manifest.license === 'string'],
    ['repository', manifest.repository !== undefined],
    ['scripts.test', typeof manifest.scripts?.test === 'string'],
    ['scripts.check', typeof manifest.scripts?.check === 'string'],
  ]) {
    if (!present) add(report, 'PKG004', 'warning', `建议声明 ${field}。`, 'package.json')
  }
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    add(report, 'PKG005', 'warning', '建议使用 package.json files 白名单限制发布内容。', 'package.json')
  } else {
    for (const value of manifest.files) {
      if (typeof value === 'string' && SECRET_FILE.test(value)) add(report, 'SEC001', 'error', `发布白名单包含敏感文件：${value}`, 'package.json')
    }
  }
  for (const script of ['preinstall', 'install', 'postinstall', 'prepare']) {
    if (manifest.scripts?.[script]) add(report, 'SEC004', 'warning', `检测到安装期脚本 ${script}，请确认其必要性并审计执行内容。`, 'package.json')
  }
  const patch = manifest.dsh?.bundle?.patch
  if (typeof patch !== 'string') {
    add(report, 'PKG002', 'error', '缺少 dsh.bundle.patch，包不会作为 DSH bundle 激活。', 'package.json')
  }
  return { main: manifest.main, patch }
}

async function checkManifestPaths(report, root, manifest, references) {
  const localReferences = new Set([references.main, references.patch, manifest.types])
  const visitExports = value => {
    if (typeof value === 'string' && value.startsWith('.')) localReferences.add(value)
    else if (value && typeof value === 'object') Object.values(value).forEach(visitExports)
  }
  visitExports(manifest.exports)
  for (const reference of localReferences) {
    if (typeof reference !== 'string') continue
    if (projectFile(root, reference) === undefined) {
      add(report, 'PKG003', 'error', `本地入口越出项目目录：${reference}`, 'package.json')
      continue
    }
    if (await existingProjectFile(root, reference) === undefined) add(report, 'PKG003', 'error', `引用的文件不存在：${reference}`, 'package.json')
  }
  if (Array.isArray(manifest.files)) {
    for (const reference of [references.main, references.patch, manifest.types]) {
      if (typeof reference !== 'string') continue
      const normalized = reference.replace(/^\.\//, '')
      const included = manifest.files.some(value => value === normalized || normalized.startsWith(`${String(value).replace(/\/$/, '')}/`))
      if (!included) add(report, 'PKG002', 'error', `发布 files 未包含 ${reference}。`, 'package.json')
    }
  }
}

async function checkPatch(report, root, patchReference) {
  if (typeof patchReference !== 'string') return
  const absolute = await existingProjectFile(root, patchReference)
  if (absolute === undefined) return
  const file = path.relative(root, absolute)
  const source = await readFile(absolute, 'utf8')
  if (!/^\s*-\s+insert\s*:/m.test(source)) add(report, 'DSH001', 'error', 'bundle patch 必须是包含 insert 操作的 YAML 数组。', file)
  const ids = [...source.matchAll(/^\s*-\s+id\s*:\s*['"]?([^\s'"]+)['"]?\s*$/gm)].map(match => match[1])
  const names = [...source.matchAll(/^\s+(?:-\s+)?name\s*:\s*['"]?([^\s'"]+)['"]?\s*$/gm)].map(match => match[1])
  if (ids.length === 0 || names.length === 0) add(report, 'DSH001', 'error', '每条插入的插件行都应包含稳定 id 和 name。', file)
  if (new Set(ids).size !== ids.length) add(report, 'DSH001', 'error', 'patch 中存在重复 id。', file)
  for (const name of names) {
    if (/^(?:[.]?[.]?\/|\/|https?:)/.test(name)) add(report, 'DSH002', 'error', `发布 bundle 不得引用本地路径或 URL：${name}`, file)
  }
  const lines = source.split('\n')
  let configIndent = -1
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const indent = line.match(/^\s*/)[0].length
    if (/^\s+config\s*:/.test(line)) configIndent = indent
    else if (configIndent >= 0 && line.trim() && indent <= configIndent) configIndent = -1
    if (line.includes('!!js') && configIndent < 0 && !/^\s+disabled\s*:/.test(line)) {
      add(report, 'DSH003', 'warning', '!!js 只能出现在 config 或 disabled 中。', file, index + 1)
    }
  }
}

function checkEntrypoint(report, sourceFile) {
  if (sourceFile === undefined) return
  const { source, file } = sourceFile
  const validShape = /export\s+(?:async\s+)?function\s+apply\s*\(/.test(source)
    || /export\s+(?:const|let)\s+apply\s*=/.test(source)
    || /export\s+default\s+(?:class|function|\{)/.test(source)
    || /export\s+default\s+[A-Za-z_$][\w$]*/.test(source)
  if (!validShape) add(report, 'CRD001', 'error', '入口未导出 apply，也不是可识别的默认函数、对象或 Service 类。', file)
  if (!/export\s+const\s+name\s*=/.test(source) && !/static\s+name\s*=/.test(source)) {
    add(report, 'CRD002', 'warning', '建议导出稳定的插件 name。', file)
  }
}

function checkSourceFile(report, sourceFile) {
  const { source, code, file } = sourceFile
  const cordisPluginSource = /export\s+(?:async\s+)?function\s+apply\s*\(|\bextends\s+Service\b|ctx\.plugin\s*\(/.test(code)
  const inject = parseInjectedServices(source)
  if (cordisPluginSource) {
    for (const match of code.matchAll(/\bctx\.([A-Za-z_$][\w$]*)/g)) {
      const service = match[1]
      if (!CONTEXT_BUILTINS.has(service) && !inject.has(service)) {
        add(report, 'CRD003', 'error', `直接使用 ctx.${service}，但 inject 未声明 "${service}"。可选依赖请改用 ctx.get()。`, file, locationOf(source, match.index))
      }
    }
  }

  const resourcePatterns = [
    ['setInterval', /\bsetInterval\s*\(/],
    ['setTimeout', /\bsetTimeout\s*\(/],
    ['WebSocket', /\bnew\s+WebSocket\s*\(/],
    ['watcher', /\b(?:watch|watchFile)\s*\(/],
    ['server', /\bcreateServer\s*\(/],
    ['child process', /\b(?:spawn|fork|execFile|exec)\s*\(/],
  ]
  for (const [label, pattern] of resourcePatterns) {
    const match = pattern.exec(code)
    if (cordisPluginSource && match && !/ctx\.effect\s*\(/.test(code)) {
      add(report, 'CRD006', 'error', `检测到 ${label} 资源，但文件中没有 ctx.effect() 生命周期管理。`, file, locationOf(source, match.index))
    }
  }

  if (/\bextends\s+Service\b/.test(code)) {
    if (!/super\s*\(\s*ctx\s*,/.test(code)) add(report, 'CRD005', 'warning', 'Service 子类应调用 super(ctx, uniqueName)。', file)
    if (!/declare\s+module\s+['"]@deepseek-ai\/cordis['"]/.test(source)) add(report, 'CRD005', 'warning', 'Service 包应通过声明合并公开 Context 类型。', file)
  }

  if (/export\s+(?:interface|type)\s+Config\b/.test(code) && !/export\s+const\s+Config\b/.test(code)) {
    add(report, 'CRD008', 'error', '声明了 Config 类型，但没有导出同名 Standard Schema。', file)
  }
  const plainConfig = /export\s+const\s+Config\s*=\s*\{/.exec(code)
  if (plainConfig && !source.includes('~standard')) add(report, 'CRD008', 'error', 'Config 是普通对象，不符合 Standard Schema。', file, locationOf(source, plainConfig.index))

  for (const match of source.matchAll(/ctx\.(?:on|emit|parallel|serial|bail|waterfall)\s*\(\s*['"]([^'"]+)['"]/g)) {
    const event = match[1]
    if (!event.startsWith('internal/') && !event.includes('/')) add(report, 'CRD010', 'warning', `事件 "${event}" 未采用 namespace/action 命名。`, file, locationOf(source, match.index))
  }
  const waterfallListener = /ctx\.on\s*\([^,]+,\s*(?:async\s*)?\(([^)]*\bnext\b[^)]*)\)\s*=>\s*\{([\s\S]{0,2500}?)\}\s*\)/g
  for (const match of source.matchAll(waterfallListener)) {
    if (!/\bnext\s*\(/.test(match[2]) && !/intentional[- ]short[- ]circuit/i.test(match[2])) {
      add(report, 'CRD011', 'error', '带 next 参数的事件监听器没有调用 next()；如需有意短路，请添加 intentional-short-circuit 注释。', file, locationOf(source, match.index))
    }
  }

  if (/\bdefineTool\s*\(/.test(code)) {
    if (!inject.has('tools')) add(report, 'TOOL001', 'error', 'defineTool 插件必须 inject tools。', file)
    for (const field of ['parameters', 'output', 'schema', 'render', 'execute']) {
      const fieldPattern = field === 'execute' ? /\bexecute\s*(?::|\()/ : new RegExp(`\\b${field}\\s*:`)
      if (!fieldPattern.test(code)) add(report, 'TOOL001', 'error', `defineTool 缺少 ${field}。`, file)
    }
  }

  const securityChecks = [
    ['SEC001', 'error', /(?:api[_-]?key|access[_-]?token|password|client[_-]?secret)\s*[:=]\s*['"][^'"\n]{8,}['"]/i, '检测到疑似硬编码秘密。'],
    ['SEC001', 'error', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, '检测到私钥内容。'],
    ['SEC002', 'error', /\beval\s*\(|\bnew\s+Function\s*\(/, '禁止使用 eval 或 new Function。', true],
    ['SEC002', 'error', /\.innerHTML\s*=|dangerouslySetInnerHTML/, '检测到危险 HTML 注入入口。', true],
    ['SEC003', 'warning', /['"]http:\/\/(?!127[.]0[.]0[.]1|localhost)/, '检测到非本地 HTTP 地址，应使用 HTTPS。'],
    ['PERF001', 'warning', /\b(?:readFileSync|writeFileSync|execFileSync|spawnSync)\s*\(/, '检测到同步 I/O，避免在 apply 或事件热路径阻塞。', true],
    ['PERF001', 'warning', /\bwhile\s*\(\s*true\s*\)|\bfor\s*\(\s*;\s*;\s*\)/, '检测到可能无界的同步循环。', true],
  ]
  for (const [ruleId, severity, pattern, message, codeOnly] of securityChecks) {
    const match = pattern.exec(codeOnly ? code : source)
    if (match) add(report, ruleId, severity, message, file, locationOf(source, match.index))
  }
  if (/from\s+['"]node:child_process['"]|require\s*\(\s*['"](?:node:)?child_process['"]\s*\)/.test(source)) {
    const shellExec = /\b(?:exec|execSync)\s*\(/.exec(code)
    if (shellExec) add(report, 'SEC002', 'error', '检测到 shell 命令执行；请改用参数化 spawn/execFile 并限制输入。', file, locationOf(source, shellExec.index))
  }
  for (const match of code.matchAll(/setInterval\s*\([^,]+,\s*(\d+)\s*\)/g)) {
    if (Number(match[1]) < 100) add(report, 'PERF002', 'warning', `高频定时器间隔为 ${match[1]}ms，建议改为可配置预算并设置背压。`, file, locationOf(source, match.index))
  }
}

function checkTests(report, manifest, files) {
  const hasTestFile = files.some(({ file }) => /(?:^|\/)(?:test|tests|__tests__)(?:\/|[.])/.test(file) || /[.](?:test|spec)\.[^.]+$/.test(file))
  if (!hasTestFile || typeof manifest.scripts?.test !== 'string') add(report, 'TST001', 'warning', '缺少可发现的自动化测试或 test 脚本。')
  const tests = files.filter(({ file }) => /(?:test|spec)/.test(file)).map(({ source }) => source).join('\n')
  if (hasTestFile && !/(?:dispose|cleanup|unload|effect)/i.test(tests)) add(report, 'TST002', 'warning', '测试中未发现 dispose/effect 清理断言。')
}

async function checkAutomation(report, root, manifest, kitConfig) {
  if (kitConfig.automation?.mode !== 'balanced') return
  const scripts = manifest.scripts ?? {}
  const requiredScripts = [
    ['dev', /dsh-cordis-kit(?:[.]js)?\s+watch/],
    ['quality:save', /dsh-cordis-kit(?:[.]js)?\s+checkpoint\s+save/],
    ['quality:ci', /dsh-cordis-kit(?:[.]js)?\s+ci/],
    ['prepack', /dsh-cordis-kit(?:[.]js)?\s+checkpoint\s+release/],
  ]
  const missing = requiredScripts.filter(([name, pattern]) => typeof scripts[name] !== 'string' || !pattern.test(scripts[name])).map(([name]) => `scripts.${name}`)
  const automationFiles = ['AGENTS.md', '.githooks/pre-commit', '.githooks/pre-push']
  const contents = new Map()
  for (const relative of automationFiles) {
    const absolute = await existingProjectFile(root, relative)
    if (!absolute) missing.push(relative)
    else contents.set(relative, await readFile(absolute, 'utf8'))
  }
  if (contents.has('.githooks/pre-commit') && !/checkpoint\s+pre-commit/.test(contents.get('.githooks/pre-commit'))) missing.push('.githooks/pre-commit checkpoint')
  if (contents.has('.githooks/pre-push') && !/checkpoint\s+pre-push/.test(contents.get('.githooks/pre-push'))) missing.push('.githooks/pre-push checkpoint')
  if (missing.length) add(report, 'AUT001', 'error', `balanced 自动化缺少或未正确配置：${missing.join(', ')}。`)

  if (kitConfig.automation.ci === 'none') return
  const candidates = ['.gitlab-ci.yml', '.cordis-kit/ci/gitlab.include.yml', '.cordis-kit/ci/README.md',
    '.workflow/MasterPipeline.yml', '.workflow/BranchPipeline.yml', '.workflow/PRPipeline.yml']
  try {
    const workflows = await readdir(path.join(root, '.github/workflows'), { withFileTypes: true })
    for (const entry of workflows) if (entry.isFile() && /[.]ya?ml$/i.test(entry.name)) candidates.push(`.github/workflows/${entry.name}`)
  } catch {}
  let integrated = false
  for (const relative of candidates) {
    const absolute = await existingProjectFile(root, relative)
    if (!absolute) continue
    const source = await readFile(absolute, 'utf8')
    if (/(?:quality:ci|dsh-cordis-kit\s+ci)/.test(source)) {
      integrated = true
      break
    }
  }
  if (!integrated) add(report, 'AUT002', 'error', 'balanced 自动化未发现调用统一 dsh-cordis-kit ci 质量门的 CI 适配。')
}

function finalize(report, strict) {
  report.diagnostics.sort((left, right) => {
    return SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity]
      || String(left.file ?? '').localeCompare(String(right.file ?? ''))
      || Number(left.line ?? 0) - Number(right.line ?? 0)
      || left.ruleId.localeCompare(right.ruleId)
  })
  report.summary = {
    errors: report.diagnostics.filter(item => item.severity === 'error').length,
    warnings: report.diagnostics.filter(item => item.severity === 'warning').length,
    infos: report.diagnostics.filter(item => item.severity === 'info').length,
  }
  report.passed = report.summary.errors === 0 && (!strict || report.summary.warnings === 0)
  return report
}

export async function checkProject(projectPath = '.', options = {}) {
  const root = path.resolve(projectPath)
  const report = {
    standardVersion: STANDARD_VERSION,
    root,
    strict: options.strict === true,
    passed: false,
    summary: { errors: 0, warnings: 0, infos: 0 },
    metrics: { filesScanned: 0, bytesScanned: 0 },
    diagnostics: [],
  }
  let manifest
  try {
    manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
  } catch (error) {
    add(report, 'PKG001', 'error', `无法读取有效的 package.json：${error.message}`, 'package.json')
    return finalize(report, report.strict)
  }
  const references = checkManifest(report, root, manifest)
  await checkManifestPaths(report, root, manifest, references)
  await checkPatch(report, root, references.patch)

  let kitConfig = {}
  try {
    kitConfig = JSON.parse(await readFile(path.join(root, 'cordis-kit.json'), 'utf8'))
  } catch (error) {
    if (error.code !== 'ENOENT') add(report, 'PKG001', 'error', `cordis-kit.json 无效：${error.message}`, 'cordis-kit.json')
  }
  await checkAutomation(report, root, manifest, kitConfig)
  const limits = {
    maxFiles: Math.min(2000, Math.max(1, Number(options.maxFiles) || 500)),
    maxFileBytes: Math.min(2 * 1024 * 1024, Math.max(1024, Number(options.maxFileBytes) || 512 * 1024)),
  }
  const ignorePatterns = Array.isArray(kitConfig.analysis?.ignore) ? kitConfig.analysis.ignore : []
  const files = await collectSourceFiles(root, limits, report, ignorePatterns)
  report.metrics.filesScanned = files.length
  report.metrics.bytesScanned = files.reduce((sum, file) => sum + file.size, 0)
  const main = typeof references.main === 'string' ? path.relative(root, path.resolve(root, references.main)) : undefined
  checkEntrypoint(report, files.find(file => file.file === main))
  for (const file of files) checkSourceFile(report, file)
  checkTests(report, manifest, files)

  try {
    const entries = await readdir(root, { withFileTypes: true })
    for (const entry of entries) {
      if (SECRET_FILE.test(entry.name)) add(report, 'SEC001', 'error', `项目根目录包含敏感文件：${entry.name}`, entry.name)
    }
  } catch {}
  return finalize(report, report.strict)
}

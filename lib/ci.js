import { access, mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import path from 'node:path'
import { detectPackageManager, runChild } from './process.js'

export const CI_PROVIDERS = Object.freeze(['github', 'gitlab', 'gitee', 'generic'])

async function exists(filename) {
  try {
    await access(filename, constants.F_OK)
    return true
  } catch {
    return false
  }
}

async function remoteUrls(root) {
  const result = await runChild('git', ['config', '--get-regexp', '^remote[.].*[.]url$'], { cwd: root, timeoutMs: 5000 })
  if (result.code !== 0) return []
  return result.output.split('\n').map(line => line.trim().split(/\s+/, 2)[1]).filter(Boolean)
}

export async function detectCiProviders(projectPath = '.') {
  const root = path.resolve(projectPath)
  const found = new Set()
  if (await exists(path.join(root, '.github/workflows'))) found.add('github')
  if (await exists(path.join(root, '.gitlab-ci.yml'))) found.add('gitlab')
  if (await exists(path.join(root, '.workflow'))) found.add('gitee')
  const urls = await remoteUrls(root)
  let repository = ''
  try {
    repository = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).repository?.url ?? ''
  } catch {}
  for (const url of [...urls, repository]) {
    if (/github[.]com/i.test(url)) found.add('github')
    else if (/gitee[.]com/i.test(url)) found.add('gitee')
    else if (/gitlab|jihulab/i.test(url)) found.add('gitlab')
  }
  return found.size > 0 ? [...found] : ['generic']
}

function ciCommands(manager) {
  if (manager === 'pnpm') return {
    setup: ['corepack enable', 'corepack prepare pnpm@11.13.1 --activate'],
    install: 'pnpm install --frozen-lockfile',
    quality: 'pnpm exec dsh-cordis-kit ci .',
  }
  if (manager === 'yarn') return {
    setup: ['corepack enable'],
    install: 'yarn install --frozen-lockfile',
    quality: 'yarn exec dsh-cordis-kit ci .',
  }
  return { setup: [], install: 'npm ci', quality: 'npx --no-install dsh-cordis-kit ci .' }
}

function github(manager) {
  const commands = ciCommands(manager)
  return `name: Cordis Quality

on:
  push:
  pull_request:

permissions:
  contents: read

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: '24'
          cache: ${manager}
${commands.setup.map(command => `      - run: ${command}`).join('\n')}${commands.setup.length ? '\n' : ''}      - run: ${commands.install}
      - run: ${commands.quality}
      - if: always()
        uses: actions/upload-artifact@v4
        with:
          name: cordis-quality-reports
          path: .cordis-kit/reports
`
}

function gitlab(manager) {
  const commands = ciCommands(manager)
  return `stages:
  - test

cordis-quality:
  stage: test
  image: node:24
  before_script:
${commands.setup.map(command => `    - ${command}`).join('\n')}${commands.setup.length ? '\n' : ''}    - ${commands.install}
  script:
    - ${commands.quality}
  artifacts:
    when: always
    paths:
      - .cordis-kit/reports/
    reports:
      junit: .cordis-kit/reports/junit.xml
`
}

function gitee(name, trigger, manager) {
  const commands = ciCommands(manager)
  return `version: '1.0'
name: cordis-quality-${name}
displayName: 'Cordis Quality (${name})'
triggers:
${trigger}
stages:
  - name: cordis-quality
    displayName: 'Cordis Quality'
    strategy: naturally
    trigger: auto
    steps:
      - step: build@nodejs
        name: cordis-quality
        displayName: 'Cordis plugin quality gate'
        nodeVersion: 22
        commands:
${[...commands.setup, commands.install, commands.quality].map(command => `          - ${command}`).join('\n')}
`
}

function giteeFiles(manager) {
  return {
    'MasterPipeline.yml': gitee('main', `  trigger: auto
  push:
    branches:
      include:
        - main`, manager),
    'BranchPipeline.yml': gitee('branch', `  trigger: auto
  push:
    branches:
      include:
        - .*
      exclude:
        - main`, manager),
    'PRPipeline.yml': gitee('pr', `  trigger: auto
  pr:
    branches:
      include:
        - main`, manager),
  }
}

function generic(manager) {
  const commands = ciCommands(manager)
  return `# Generic CI integration

Use the same platform-neutral quality gate in Jenkins, Buildkite, Drone, Woodpecker,
Azure Pipelines, or an internal runner:

\`\`\`sh
${[...commands.setup, commands.install, commands.quality].join('\n')}
\`\`\`

The command returns a stable non-zero exit code on failure and writes JSON, JUnit,
SARIF, and Markdown reports to \`.cordis-kit/reports/\`.
`
}

async function writeNew(root, relative, content, result) {
  const absolute = path.join(root, relative)
  await mkdir(path.dirname(absolute), { recursive: true })
  const [realRoot, realParent] = await Promise.all([realpath(root), realpath(path.dirname(absolute))])
  const parentRelative = path.relative(realRoot, realParent)
  if (parentRelative.startsWith('..') || path.isAbsolute(parentRelative)) throw new Error(`CI 目录通过符号链接越出项目：${relative}`)
  try {
    await writeFile(path.join(realParent, path.basename(absolute)), content, { encoding: 'utf8', flag: 'wx' })
    result.created.push(relative)
    return true
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
    result.skipped.push(relative)
    return false
  }
}

function parseProviders(value) {
  if (!value || value === 'auto') return undefined
  if (value === 'none') return []
  if (value === 'all') return [...CI_PROVIDERS]
  const providers = value.split(',').map(item => item.trim()).filter(Boolean)
  const invalid = providers.filter(item => !CI_PROVIDERS.includes(item))
  if (invalid.length) throw new Error(`未知 CI provider：${invalid.join(', ')}`)
  return [...new Set(providers)]
}

export async function setupCi(projectPath = '.', provider = 'auto') {
  const root = path.resolve(projectPath)
  const providers = parseProviders(provider) ?? await detectCiProviders(root)
  const manager = (await detectPackageManager(root)).name
  const result = { root, providers, manager, created: [], skipped: [], notices: [] }
  for (const current of providers) {
    if (current === 'github') await writeNew(root, '.github/workflows/cordis-quality.yml', github(manager), result)
    else if (current === 'gitlab') {
      const target = '.gitlab-ci.yml'
      const created = await writeNew(root, target, gitlab(manager), result)
      if (!created) {
        const include = '.cordis-kit/ci/gitlab.include.yml'
        await writeNew(root, include, gitlab(manager), result)
        result.notices.push(`已有 ${target}，未覆盖；请在其中 include: [local: '${include}']。`)
      }
    } else if (current === 'gitee') {
      for (const [filename, content] of Object.entries(giteeFiles(manager))) await writeNew(root, `.workflow/${filename}`, content, result)
      result.notices.push('Gitee 仓库需在网页端开通一次 Gitee Go，之后 push/PR 才会读取 .workflow。')
    } else if (current === 'generic') await writeNew(root, '.cordis-kit/ci/README.md', generic(manager), result)
  }
  return result
}

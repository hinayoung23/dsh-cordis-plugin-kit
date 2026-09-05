import { mkdir, readdir, writeFile, lstat } from 'node:fs/promises'
import path from 'node:path'
import { setupAutomation } from './automation.js'
import { setupCi } from './ci.js'

const KIT_VERSION = '0.2.1'

function validPackageName(value) {
  return /^(?:@[a-z0-9._-]+\/)?[a-z0-9][a-z0-9._-]*$/.test(value)
}

function serviceName(packageName) {
  const bare = packageName.replace(/^@[^/]+\//, '')
  return bare.replace(/[-_.]+([a-z0-9])/g, (_match, letter) => letter.toUpperCase()) + 'State'
}

function templateFiles(packageName, options = {}) {
  const pluginName = packageName.replace(/^@[^/]+\//, '')
  const id = pluginName.replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')
  const service = serviceName(packageName)
  const manifest = {
    name: packageName,
    version: '0.1.0',
    description: 'A lifecycle-safe Cordis plugin for DeepSeek Harness.',
    packageManager: 'pnpm@11.13.1',
    type: 'module',
    main: 'index.js',
    files: ['index.js', 'cordis.patch.yml', 'cordis-kit.json', 'README.md', 'LICENSE'],
    scripts: {
      test: 'node --test test/*.test.js',
      check: 'dsh-cordis-kit check . --strict && node --test test/*.test.js',
      dev: 'dsh-cordis-kit watch .',
      'quality:save': 'dsh-cordis-kit checkpoint save .',
      'quality:commit': 'dsh-cordis-kit checkpoint pre-commit .',
      'quality:push': 'dsh-cordis-kit checkpoint pre-push .',
      'quality:ci': 'dsh-cordis-kit ci .',
      debug: 'dsh-cordis-kit debug .',
      perf: 'dsh-cordis-kit perf .',
      prepack: 'dsh-cordis-kit checkpoint release . --skip-package',
    },
    devDependencies: {
      '@deepseek-ai/cordis': '^4.0.2',
      'dsh-cordis-plugin-kit': `^${KIT_VERSION}`,
    },
    engines: { node: '>=22' },
    license: 'MIT',
    publishConfig: { access: 'public', registry: 'https://registry.npmjs.org/' },
    repository: { type: 'git', url: `git+https://github.com/your-name/${pluginName}.git` },
    dsh: { bundle: { patch: './cordis.patch.yml' } },
  }
  return new Map([
    ['package.json', `${JSON.stringify(manifest, null, 2)}\n`],
    ['index.js', `export const name = '${pluginName}'

export function apply(ctx) {
  const logger = ctx.logger(name)
  const state = Object.freeze({ loadedAt: Date.now() })
  ctx.provide('${service}', state)
  ctx.effect(() => {
    logger.info('%s loaded', name)
    return () => logger.info('%s disposed', name)
  }, '${pluginName}: lifecycle')
}
`],
    ['cordis.patch.yml', `- insert:
    - id: ${id}
      name: ${packageName}
`],
    ['cordis-kit.json', `${JSON.stringify({
      entry: './index.js',
      config: {},
      provide: [],
      ...(options.automation === 'none' ? {} : { automation: { mode: 'balanced', debounceMs: 800, ci: options.ci ?? 'auto' } }),
      performance: { iterations: 30, maxApplyP95Ms: 50, maxDisposeP95Ms: 50, maxHeapGrowthKb: 1024 },
    }, null, 2)}\n`],
    ['test/plugin.test.js', `import assert from 'node:assert/strict'
import test from 'node:test'
import { apply, name } from '../index.js'

test('plugin registers its service and cleans up its effect', async () => {
  const lifecycle = []
  const services = new Map()
  const effects = []
  const ctx = {
    logger: () => ({ info() {} }),
    provide(key, value) {
      services.set(key, value)
      return () => services.delete(key)
    },
    effect(setup) {
      const dispose = setup()
      effects.push(dispose)
      return dispose
    },
  }

  apply(ctx)
  lifecycle.push('active')
  assert.equal(name, '${pluginName}')
  assert.equal(services.has('${service}'), true)
  for (const dispose of effects.reverse()) await dispose()
  lifecycle.push('disposed')
  assert.deepEqual(lifecycle, ['active', 'disposed'])
})
`],
    ['README.md', `# ${packageName}

由 \`dsh-cordis-plugin-kit\` 生成的 DeepSeek Harness Cordis 插件。

## 开发

\`\`\`sh
pnpm install
pnpm check
pnpm dev
pnpm debug
pnpm perf
pnpm quality:ci
\`\`\`

## 本地安装

\`\`\`sh
dsh plugin --profile web add .
dsh --profile web --dump-config
\`\`\`
`],
    ['LICENSE', `MIT License

Copyright (c) ${new Date().getFullYear()}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`],
    ['.gitignore', 'node_modules/\n*.tgz\ncoverage/\n.cordis-kit/reports/\n.DS_Store\n'],
    ['.gitattributes', '* text=auto\n.githooks/* text eol=lf\n'],
  ])
}

export async function scaffoldProject(destination, options = {}) {
  const root = path.resolve(destination)
  const packageName = options.name ?? path.basename(root).toLowerCase().replace(/[^a-z0-9._-]+/g, '-')
  if (!validPackageName(packageName)) throw new Error(`无效的 npm 包名：${packageName}`)
  try {
    const info = await lstat(root)
    if (info.isSymbolicLink()) throw new Error('目标目录不能是符号链接。')
    if (!info.isDirectory()) throw new Error('目标路径已存在且不是目录。')
    const entries = await readdir(root)
    if (entries.length > 0) throw new Error('目标目录非空；为避免覆盖文件，初始化已停止。')
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    await mkdir(root, { recursive: true })
  }
  const files = templateFiles(packageName, options)
  for (const [relative, content] of files) {
    const absolute = path.join(root, relative)
    await mkdir(path.dirname(absolute), { recursive: true })
    await writeFile(absolute, content, { encoding: 'utf8', flag: 'wx' })
  }
  let automation
  if (options.automation !== 'none') automation = await setupAutomation(root, { git: options.git, ci: options.ci })
  const ci = await setupCi(root, options.ci ?? 'auto')
  const created = [
    ...files.keys(),
    ...(automation ? ['AGENTS.md', ...automation.hooks] : []),
    ...ci.created,
  ]
  return { root, packageName, files: [...new Set(created)], automation, ci }
}

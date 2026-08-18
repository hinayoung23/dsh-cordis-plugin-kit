import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runChild } from '../lib/process.js'
import { scaffoldProject } from '../lib/scaffold.js'

const kitRoot = fileURLToPath(new URL('../', import.meta.url))
const parent = await mkdtemp(path.join(os.tmpdir(), 'dsh-cordis-kit-e2e-'))
const target = path.join(parent, 'generated-plugin')

try {
  await scaffoldProject(target, { name: 'generated-cordis-plugin' })
  const manifestPath = path.join(target, 'package.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  manifest.devDependencies['dsh-cordis-plugin-kit'] = `file:${kitRoot}`
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

  const install = await runChild('pnpm', ['install', '--offline'], { cwd: target, timeoutMs: 60_000 })
  assert.equal(install.code, 0, install.output)
  for (const script of ['check', 'debug', 'perf']) {
    const result = await runChild('pnpm', [script], { cwd: target, timeoutMs: 60_000 })
    assert.equal(result.code, 0, `${script} failed:\n${result.output}`)
  }
  const qualityTest = await runChild('pnpm', ['exec', 'dsh-cordis-kit', 'test', '.', '--strict'], { cwd: target, timeoutMs: 60_000 })
  assert.equal(qualityTest.code, 0, `quality test failed:\n${qualityTest.output}`)
  console.log(`generated project passed check/test/debug/perf: ${target}`)
} finally {
  await rm(parent, { recursive: true, force: true })
}

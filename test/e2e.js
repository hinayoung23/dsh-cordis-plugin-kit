import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runChild } from '../lib/process.js'
import { scaffoldProject } from '../lib/scaffold.js'

const kitRoot = fileURLToPath(new URL('../', import.meta.url))
const parent = await mkdtemp(path.join(os.tmpdir(), 'dsh-cordis-kit-e2e-'))
const target = path.join(parent, 'generated-plugin')

function verifyLiveWatcher(root) {
  return new Promise((resolve, reject) => {
    const child = spawn('pnpm', ['dev'], { cwd: root, shell: false, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    let changed = false
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error(`live watcher timeout:\n${output}`))
    }, 10_000)
    const append = async chunk => {
      output += chunk.toString()
      if (!changed && output.includes('监听中：')) {
        changed = true
        const entry = path.join(root, 'index.js')
        await writeFile(entry, `${await readFile(entry, 'utf8')}\n// watcher e2e change\n`)
      }
      if (changed && output.includes('] index.js')) {
        clearTimeout(timer)
        child.kill('SIGTERM')
        resolve()
      }
    }
    child.stdout.on('data', chunk => append(chunk).catch(reject))
    child.stderr.on('data', chunk => append(chunk).catch(reject))
    child.on('error', reject)
  })
}

try {
  await scaffoldProject(target, { name: 'generated-cordis-plugin' })
  const manifestPath = path.join(target, 'package.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  manifest.devDependencies['dsh-cordis-plugin-kit'] = `file:${kitRoot}`
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

  const install = await runChild('pnpm', ['install', '--offline'], { cwd: target, timeoutMs: 60_000 })
  assert.equal(install.code, 0, install.output)
  for (const script of ['check', 'debug', 'perf', 'quality:ci']) {
    const result = await runChild('pnpm', [script], { cwd: target, timeoutMs: 60_000 })
    assert.equal(result.code, 0, `${script} failed:\n${result.output}`)
  }
  for (const hook of ['pre-commit', 'pre-push']) {
    const result = await runChild(path.join(target, '.githooks', hook), [], { cwd: target, timeoutMs: 60_000 })
    assert.equal(result.code, 0, `${hook} failed:\n${result.output}`)
  }
  const watchOnce = await runChild('pnpm', ['exec', 'dsh-cordis-kit', 'watch', '.', '--once'], { cwd: target, timeoutMs: 60_000 })
  assert.equal(watchOnce.code, 0, `watch --once failed:\n${watchOnce.output}`)
  await verifyLiveWatcher(target)
  const qualityTest = await runChild('pnpm', ['exec', 'dsh-cordis-kit', 'test', '.', '--strict'], { cwd: target, timeoutMs: 60_000 })
  assert.equal(qualityTest.code, 0, `quality test failed:\n${qualityTest.output}`)
  console.log(`generated project passed hooks/check/test/debug/perf/ci/watch: ${target}`)
} finally {
  await rm(parent, { recursive: true, force: true })
}

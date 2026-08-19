import { lstat, readdir } from 'node:fs/promises'
import path from 'node:path'
import { runQuality } from './quality.js'

const IGNORED_SEGMENTS = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', '.cordis-kit'])
const RELEVANT_FILES = new Set(['package.json', 'cordis-kit.json', 'cordis.patch.yml', 'pnpm-lock.yaml', 'package-lock.json', 'yarn.lock'])
const RELEVANT_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts', '.jsx', '.tsx', '.json', '.yml', '.yaml'])

export function isRelevantChange(filename) {
  if (!filename) return true
  const normalized = String(filename).replaceAll('\\', '/')
  const segments = normalized.split('/')
  if (segments.some(segment => IGNORED_SEGMENTS.has(segment))) return false
  return RELEVANT_FILES.has(path.posix.basename(normalized)) || RELEVANT_EXTENSIONS.has(path.posix.extname(normalized))
}

async function snapshot(root, limits) {
  const files = new Map()
  const queue = [root]
  let directories = 0
  while (queue.length) {
    const directory = queue.shift()
    directories += 1
    if (directories > limits.maxDirectories) throw new Error(`监听目录超过上限 ${limits.maxDirectories}；请缩小项目或增加忽略目录。`)
    let entries
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch (error) {
      if (error.code === 'ENOENT') continue
      throw error
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue
      const absolute = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        if (!IGNORED_SEGMENTS.has(entry.name)) queue.push(absolute)
        continue
      }
      const relative = path.relative(root, absolute)
      if (!entry.isFile() || !isRelevantChange(relative)) continue
      if (files.size >= limits.maxFiles) throw new Error(`监听文件超过上限 ${limits.maxFiles}；请缩小项目或增加忽略目录。`)
      try {
        const info = await lstat(absolute)
        files.set(relative, `${info.mtimeMs}:${info.ctimeMs}:${info.size}`)
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
      }
    }
  }
  return files
}

function firstChange(before, after) {
  for (const [filename, value] of after) if (before.get(filename) !== value) return filename
  for (const filename of before.keys()) if (!after.has(filename)) return filename
}

export async function watchProject(projectPath = '.', options = {}) {
  const root = path.resolve(projectPath)
  const debounceMs = Math.min(10_000, Math.max(100, Number(options.debounceMs) || 800))
  const execute = options.execute ?? ((target) => runQuality(target, 'save', { reports: true }))
  let running = false
  let pending = false
  let closed = false
  let scanning = false

  const run = async reason => {
    if (running) {
      pending = true
      return
    }
    running = true
    do {
      pending = false
      try {
        const result = await execute(root)
        options.onResult?.(result, reason)
      } catch (error) {
        options.onError?.(error)
      }
    } while (pending && !closed)
    running = false
  }

  const limits = {
    maxDirectories: Math.min(2000, Math.max(10, Number(options.maxDirectories) || 500)),
    maxFiles: Math.min(10_000, Math.max(10, Number(options.maxFiles) || 2000)),
  }
  let previous = await snapshot(root, limits)
  await run('initial')
  const timer = setInterval(async () => {
    if (scanning || closed) return
    scanning = true
    try {
      const current = await snapshot(root, limits)
      const changed = firstChange(previous, current)
      previous = current
      if (changed) await run(changed)
    } catch (error) {
      options.onError?.(error)
    } finally {
      scanning = false
    }
  }, debounceMs)
  return {
    root,
    close() {
      closed = true
      clearInterval(timer)
    },
  }
}

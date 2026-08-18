import { access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'

async function exists(filename) {
  try {
    await access(filename, constants.F_OK)
    return true
  } catch {
    return false
  }
}

export async function detectPackageManager(root) {
  if (await exists(path.join(root, 'pnpm-lock.yaml'))) return { command: 'pnpm', args: ['test'] }
  if (await exists(path.join(root, 'yarn.lock'))) return { command: 'yarn', args: ['test'] }
  return { command: 'npm', args: ['test', '--if-present'] }
}

export function runChild(command, args, options = {}) {
  const timeoutMs = Math.min(10 * 60_000, Math.max(100, Number(options.timeoutMs) || 30_000))
  const maxOutputBytes = Math.min(10 * 1024 * 1024, Math.max(1024, Number(options.maxOutputBytes) || 1024 * 1024))
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    let truncated = false
    const append = chunk => {
      if (output.length >= maxOutputBytes) {
        truncated = true
        return
      }
      output += chunk.toString('utf8', 0, Math.max(0, maxOutputBytes - output.length))
    }
    child.stdout.on('data', append)
    child.stderr.on('data', append)
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
      setTimeout(() => child.kill('SIGKILL'), 1000).unref()
    }, timeoutMs)
    timer.unref()
    child.on('error', error => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      resolve({ code: code ?? 1, signal, timedOut, truncated, output })
    })
  })
}

import { access, readFile } from 'node:fs/promises'
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
  if (await exists(path.join(root, 'pnpm-lock.yaml'))) return { name: 'pnpm', command: 'pnpm', args: ['test'] }
  if (await exists(path.join(root, 'yarn.lock'))) return { name: 'yarn', command: 'yarn', args: ['test'] }
  try {
    const declared = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).packageManager
    if (typeof declared === 'string' && declared.startsWith('pnpm@')) return { name: 'pnpm', command: 'pnpm', args: ['test'] }
    if (typeof declared === 'string' && declared.startsWith('yarn@')) return { name: 'yarn', command: 'yarn', args: ['test'] }
  } catch {}
  return { name: 'npm', command: 'npm', args: ['test', '--if-present'] }
}

// Package-manager shims are .cmd files on Windows, not executable binaries.
// Only this fixed set uses cmd.exe; reject shell syntax before quoting args.
export function childInvocation(command, args, platform = process.platform, env = process.env) {
  if (platform !== 'win32' || !/^(npm|pnpm|yarn)(?:\.cmd)?$/i.test(command)) return { command, args }
  if (args.some(value => typeof value !== 'string' || /["%!^&|<>\r\n()\0]/.test(value))) {
    throw new Error('Windows package-manager arguments must not contain shell metacharacters.')
  }
  const shim = command.replace(/\.cmd$/i, '') + '.cmd'
  const comspec = Object.entries(env).find(([key]) => key.toLowerCase() === 'comspec')?.[1] || 'cmd.exe'
  return {
    command: comspec,
    args: ['/d', '/s', '/c', `"${shim} ${args.map(value => `"${value}"`).join(' ')}"`],
    windowsVerbatimArguments: true,
  }
}

export function runChild(command, args, options = {}) {
  const timeoutMs = Math.min(10 * 60_000, Math.max(100, Number(options.timeoutMs) || 30_000))
  const maxOutputBytes = Math.min(10 * 1024 * 1024, Math.max(1024, Number(options.maxOutputBytes) || 1024 * 1024))
  const env = { ...process.env, ...options.env }
  const invocation = childInvocation(command, args, process.platform, env)
  return new Promise((resolve, reject) => {
    const child = spawn(invocation.command, invocation.args, {
      cwd: options.cwd,
      env,
      shell: false,
      windowsVerbatimArguments: invocation.windowsVerbatimArguments,
      windowsHide: true,
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
      if (process.platform === 'win32' && child.pid) {
        // Terminate the shim and its descendants so timed-out gates cannot linger.
        const killer = spawn('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' })
        killer.on('error', () => child.kill('SIGKILL'))
        return
      }
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

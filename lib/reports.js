import { lstat, mkdir, realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'

function xml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function junit(result) {
  const failures = result.stages.filter(stage => stage.status === 'failed').length
  const skipped = result.stages.filter(stage => stage.status === 'skipped').length
  const duration = result.stages.reduce((sum, stage) => sum + stage.durationMs, 0) / 1000
  const cases = result.stages.map(stage => {
    const detail = stage.output || stage.failures?.join('\n') || ''
    if (stage.status === 'failed') {
      return `    <testcase classname="dsh-cordis-plugin-kit" name="${xml(stage.name)}" time="${stage.durationMs / 1000}"><failure message="${xml(stage.summary)}">${xml(detail)}</failure></testcase>`
    }
    if (stage.status === 'skipped') {
      return `    <testcase classname="dsh-cordis-plugin-kit" name="${xml(stage.name)}" time="${stage.durationMs / 1000}"><skipped message="${xml(stage.summary)}"/></testcase>`
    }
    return `    <testcase classname="dsh-cordis-plugin-kit" name="${xml(stage.name)}" time="${stage.durationMs / 1000}"/>`
  }).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<testsuites tests="${result.stages.length}" failures="${failures}" skipped="${skipped}" time="${duration}">
  <testsuite name="cordis-quality:${xml(result.checkpoint)}" tests="${result.stages.length}" failures="${failures}" skipped="${skipped}" time="${duration}">
${cases}
  </testsuite>
</testsuites>
`
}

function sarif(result) {
  const diagnostics = result.check?.diagnostics ?? []
  const rules = [...new Map(diagnostics.map(item => [item.ruleId, {
    id: item.ruleId,
    shortDescription: { text: item.message },
  }])).values()]
  return {
    version: '2.1.0',
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    runs: [{
      tool: { driver: { name: 'dsh-cordis-plugin-kit', version: result.kitVersion, rules } },
      results: diagnostics.map(item => ({
        ruleId: item.ruleId,
        level: item.severity === 'error' ? 'error' : item.severity === 'warning' ? 'warning' : 'note',
        message: { text: item.message },
        ...(item.file ? {
          locations: [{ physicalLocation: {
            artifactLocation: { uri: item.file },
            ...(item.line ? { region: { startLine: item.line } } : {}),
          } }],
        } : {}),
      })),
    }],
  }
}

function markdown(result) {
  const lines = [
    '# Cordis quality report',
    '',
    `- Checkpoint: \`${result.checkpoint}\``,
    `- Provider: \`${result.provider}\``,
    `- Result: **${result.passed ? 'PASS' : 'FAIL'}**`,
    `- Started: ${result.startedAt}`,
    '',
    '| Stage | Status | Duration | Summary |',
    '| --- | --- | ---: | --- |',
  ]
  for (const stage of result.stages) {
    lines.push(`| ${stage.name} | ${stage.status} | ${stage.durationMs} ms | ${String(stage.summary).replaceAll('|', '\\|')} |`)
  }
  if (result.check?.diagnostics?.length) {
    lines.push('', '## Diagnostics', '')
    for (const item of result.check.diagnostics) {
      const location = item.file ? ` (${item.file}${item.line ? `:${item.line}` : ''})` : ''
      lines.push(`- **${item.severity} ${item.ruleId}**${location}: ${item.message}`)
    }
  }
  return `${lines.join('\n')}\n`
}

export async function writeQualityReports(result, options = {}) {
  const directory = path.resolve(result.root, options.directory ?? '.cordis-kit/reports')
  const relative = path.relative(result.root, directory)
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('报告目录必须位于项目目录内。')
  await mkdir(directory, { recursive: true })
  const [realRoot, realDirectory] = await Promise.all([realpath(result.root), realpath(directory)])
  const realRelative = path.relative(realRoot, realDirectory)
  if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) throw new Error('报告目录不得通过符号链接越出项目目录。')
  const files = {
    json: path.join(directory, 'result.json'),
    junit: path.join(directory, 'junit.xml'),
    sarif: path.join(directory, 'security.sarif'),
    markdown: path.join(directory, 'summary.md'),
  }
  for (const filename of Object.values(files)) {
    try {
      const info = await lstat(filename)
      if (info.isSymbolicLink() || !info.isFile()) throw new Error(`拒绝覆盖非普通报告文件：${filename}`)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
  }
  await Promise.all([
    writeFile(files.json, `${JSON.stringify(result, null, 2)}\n`, 'utf8'),
    writeFile(files.junit, junit(result), 'utf8'),
    writeFile(files.sarif, `${JSON.stringify(sarif(result), null, 2)}\n`, 'utf8'),
    writeFile(files.markdown, markdown(result), 'utf8'),
  ])
  return files
}

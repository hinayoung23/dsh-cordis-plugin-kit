const COLORS = {
  error: '\u001b[31m',
  warning: '\u001b[33m',
  info: '\u001b[36m',
  green: '\u001b[32m',
  dim: '\u001b[2m',
  reset: '\u001b[0m',
}

function color(value, kind, enabled) {
  return enabled ? `${COLORS[kind]}${value}${COLORS.reset}` : value
}

export function formatCheckReport(report, options = {}) {
  const colors = options.colors ?? process.stdout.isTTY
  const lines = []
  for (const item of report.diagnostics) {
    const location = item.file ? `${item.file}${item.line ? `:${item.line}` : ''}` : report.root
    const label = item.severity.toUpperCase().padEnd(7)
    lines.push(`${color(label, item.severity, colors)} ${item.ruleId} ${location} ${item.message}`)
  }
  const { errors, warnings, infos } = report.summary
  const status = report.passed ? color('PASS', 'green', colors) : color('FAIL', 'error', colors)
  lines.push(`${status} ${errors} error(s), ${warnings} warning(s), ${infos} info(s); ${report.metrics.filesScanned} source file(s) scanned`)
  return lines.join('\n')
}

export function formatStandards(rules, options = {}) {
  const colors = options.colors ?? process.stdout.isTTY
  return rules.map(rule => {
    const label = color(rule.severity.toUpperCase().padEnd(7), rule.severity, colors)
    return `${label} ${rule.id} [${rule.category}] ${rule.requirement}`
  }).join('\n')
}

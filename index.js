import { checkProject } from './lib/checker.js'
import { STANDARD_VERSION, getStandards } from './lib/standards.js'

export const name = 'dsh-cordis-plugin-kit'

export function apply(ctx) {
  const service = Object.freeze({
    version: STANDARD_VERSION,
    standards: () => getStandards(),
    check: (projectPath, options) => checkProject(projectPath, options),
  })
  ctx.provide('cordisPluginKit', service)
}

export { checkProject, getStandards, STANDARD_VERSION }

import { checkProject } from './lib/checker.js'
import { runQuality } from './lib/quality.js'
import { STANDARD_VERSION, getStandards } from './lib/standards.js'

export const name = 'dsh-cordis-plugin-kit'

export function apply(ctx) {
  const service = Object.freeze({
    version: STANDARD_VERSION,
    standards: () => getStandards(),
    check: (projectPath, options) => checkProject(projectPath, options),
    quality: (projectPath, checkpoint, options) => runQuality(projectPath, checkpoint, options),
  })
  ctx.provide('cordisPluginKit', service)
}

export { checkProject, getStandards, runQuality, STANDARD_VERSION }
export { detectCiProviders, setupCi } from './lib/ci.js'
export { CHECKPOINTS, KIT_VERSION } from './lib/quality.js'

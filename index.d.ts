import type { Context } from '@deepseek-ai/cordis'
import type { CheckOptions, CheckReport } from './lib/checker.js'
import type { QualityCheckpoint, QualityOptions, QualityResult } from './lib/quality.js'
import type { StandardRule } from './lib/standards.js'

export interface CordisPluginKitService {
  readonly version: string
  standards(): readonly StandardRule[]
  check(projectPath: string, options?: CheckOptions): Promise<CheckReport>
  quality(projectPath: string, checkpoint?: QualityCheckpoint, options?: QualityOptions): Promise<QualityResult>
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    cordisPluginKit: CordisPluginKitService
  }
}

export declare const name = "dsh-cordis-plugin-kit"
export declare function apply(ctx: Context): void
export { checkProject } from './lib/checker.js'
export { detectCiProviders, setupCi } from './lib/ci.js'
export { CHECKPOINTS, KIT_VERSION, runQuality } from './lib/quality.js'
export { getStandards, STANDARD_VERSION } from './lib/standards.js'

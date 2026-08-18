import type { Context } from '@deepseek-ai/cordis'
import type { CheckOptions, CheckReport } from './lib/checker.js'
import type { StandardRule } from './lib/standards.js'

export interface CordisPluginKitService {
  readonly version: string
  standards(): readonly StandardRule[]
  check(projectPath: string, options?: CheckOptions): Promise<CheckReport>
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    cordisPluginKit: CordisPluginKitService
  }
}

export declare const name = "dsh-cordis-plugin-kit"
export declare function apply(ctx: Context): void
export { checkProject } from './lib/checker.js'
export { getStandards, STANDARD_VERSION } from './lib/standards.js'

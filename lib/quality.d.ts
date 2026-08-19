import type { CheckReport } from './checker.js'

export type QualityCheckpoint = 'save' | 'pre-commit' | 'pre-push' | 'release' | 'ci'
export interface QualityOptions {
  timeoutMs?: number
  iterations?: number
  maxApplyMs?: number
  maxDisposeMs?: number
  maxHeapKb?: number
  configFile?: string
  provide?: string[]
  skipPackage?: boolean
  reports?: boolean
  reportDirectory?: string
  env?: Record<string, string | undefined>
}
export interface QualityStage {
  name: string
  status: 'passed' | 'failed' | 'skipped'
  durationMs: number
  summary: string
  output?: string
  failures?: string[]
}
export interface QualityResult {
  kitVersion: string
  checkpoint: QualityCheckpoint
  root: string
  provider: 'local' | 'github' | 'gitlab' | 'gitee' | 'generic'
  startedAt: string
  finishedAt: string
  passed: boolean
  stages: QualityStage[]
  check: CheckReport
  reports?: Record<'json' | 'junit' | 'sarif' | 'markdown', string>
}
export declare const KIT_VERSION: string
export declare const CHECKPOINTS: readonly QualityCheckpoint[]
export declare function runQuality(projectPath?: string, checkpoint?: QualityCheckpoint, options?: QualityOptions): Promise<QualityResult>
export declare function formatQualityResult(result: QualityResult): string

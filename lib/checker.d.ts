export interface CheckOptions {
  strict?: boolean
  maxFiles?: number
  maxFileBytes?: number
}
export interface Diagnostic {
  ruleId: string
  severity: 'error' | 'warning' | 'info'
  message: string
  file?: string
  line?: number
  detail?: string
}
export interface CheckReport {
  standardVersion: string
  root: string
  strict: boolean
  passed: boolean
  summary: { errors: number, warnings: number, infos: number }
  metrics: { filesScanned: number, bytesScanned: number }
  diagnostics: Diagnostic[]
}
export declare function checkProject(projectPath?: string, options?: CheckOptions): Promise<CheckReport>

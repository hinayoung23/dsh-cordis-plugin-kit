export type StandardSeverity = 'error' | 'warning' | 'info'
export interface StandardRule {
  id: string
  severity: StandardSeverity
  category: string
  requirement: string
  source: string
}
export declare const STANDARD_VERSION: string
export declare const STANDARDS: readonly StandardRule[]
export declare function getStandards(): StandardRule[]

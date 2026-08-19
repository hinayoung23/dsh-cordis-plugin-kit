export type CiProvider = 'github' | 'gitlab' | 'gitee' | 'generic'
export interface CiSetupResult {
  root: string
  providers: CiProvider[]
  manager: 'pnpm' | 'yarn' | 'npm'
  created: string[]
  skipped: string[]
  notices: string[]
}
export declare const CI_PROVIDERS: readonly CiProvider[]
export declare function detectCiProviders(projectPath?: string): Promise<CiProvider[]>
export declare function setupCi(projectPath?: string, provider?: 'auto' | 'all' | 'none' | CiProvider | string): Promise<CiSetupResult>

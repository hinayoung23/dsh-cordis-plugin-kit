export const name = 'fixture-pending-plugin'
export const inject = ['missingService']
export function apply() {
  throw new Error('PENDING plugin must not execute')
}

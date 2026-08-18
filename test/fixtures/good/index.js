export const name = 'fixture-good-cordis-plugin'

export function apply(ctx) {
  ctx.effect(() => {
    const resource = { active: true }
    return () => {
      resource.active = false
    }
  }, 'fixture lifecycle')
}

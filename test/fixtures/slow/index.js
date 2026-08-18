export const name = 'fixture-slow-plugin'
export async function apply() {
  await new Promise(() => setInterval(() => {}, 1000))
}

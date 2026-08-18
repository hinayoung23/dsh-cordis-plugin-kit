export const Config = {}

export function apply(ctx) {
  const apiKey = 'sk-this-is-a-hardcoded-secret'
  setInterval(() => ctx.tools.register(defineTool({ execute() {} })), 10)
  ctx.on('bad-event', async (input, next) => {
    return input
  })
  eval(apiKey)
}

export const STANDARD_VERSION = '2026.08'

const rules = [
  ['PKG001', 'error', 'manifest', '必须提供有效的 package.json，并使用明确的 ESM 入口。'],
  ['PKG002', 'error', 'manifest', 'DSH bundle 必须声明 dsh.bundle.patch，patch 文件必须存在并包含在发布文件中。'],
  ['PKG003', 'error', 'manifest', 'package main、types、exports 和 files 中引用的本地路径必须位于项目内且真实存在。'],
  ['PKG004', 'warning', 'manifest', '包应声明 Node.js >=22、许可证、仓库地址以及 test/check 脚本。'],
  ['PKG005', 'warning', 'distribution', '发布文件应使用 files 白名单；不应发布测试缓存、密钥或本地环境文件。'],
  ['DSH001', 'error', 'bundle', 'cordis.patch.yml 应是 patch 数组，并至少插入一条包含稳定 id 与 npm 模块名的插件行。'],
  ['DSH002', 'error', 'bundle', '已发布 bundle 的插件模块名不得使用绝对路径、相对源码路径或 URL。'],
  ['DSH003', 'warning', 'bundle', 'patch 中的 !!js 只能用于 config 或 disabled；覆盖已有 id 时必须重述完整 config。'],
  ['CRD001', 'error', 'cordis', '插件入口必须是函数、Service 类，或具有 apply(ctx, config) 的对象。'],
  ['CRD002', 'warning', 'cordis', '插件应导出稳定 name，便于 Fiber、日志和故障诊断。'],
  ['CRD003', 'error', 'dependency', '直接读取 ctx.<service> 的必需服务必须声明 inject；可选服务应使用 ctx.get()。'],
  ['CRD004', 'warning', 'dependency', '不得依赖 cordis.yml 行顺序表达启动先后；加载顺序应由 inject 决定。'],
  ['CRD005', 'warning', 'service', 'Service 子类应调用 super(ctx, uniqueName)，并通过声明合并公开 ctx 服务类型。'],
  ['CRD006', 'error', 'lifecycle', '定时器、网络连接、watcher、服务器和进程等外部资源必须由 ctx.effect() 管理并返回 disposer。'],
  ['CRD007', 'warning', 'lifecycle', '异步清理存在顺序依赖时，必须放在同一 disposer 内串行 await；注册应可重复加载且无全局残留。'],
  ['CRD008', 'error', 'config', '导出的 Config 必须实现 Standard Schema；普通对象不能作为 Cordis Config。'],
  ['CRD009', 'warning', 'config', '不同部署可能变化的超时、端口、重试和资源限制应进入 Config schema，并尽早拒绝无效配置。'],
  ['CRD010', 'warning', 'event', '自定义 Cordis 事件必须采用 namespace/action 命名并通过 Events 声明合并提供类型。'],
  ['CRD011', 'error', 'event', 'waterfall 观察/包装监听器必须调用 next()；不调用只允许用于明确注明的有意短路。'],
  ['CRD012', 'warning', 'hmr', '插件必须支持依赖消失、配置更新和 HMR 后的卸载/重载，不得依赖一次性顶层副作用。'],
  ['CRD013', 'warning', 'diagnostics', '调试必须检查 Fiber 的 PENDING、FAILED 和清理结果，避免把缺失服务误判为成功加载。'],
  ['CRD014', 'warning', 'architecture', '只有 Service Definition、Provider、Consumer 需要独立演进时才拆包；Provider 与 Consumer 不应互相依赖。'],
  ['TOOL001', 'error', 'dsh-tool', '使用 ctx.tools 或 defineTool 的插件必须 inject tools，并声明 parameters、output.schema、output.render 与 execute。'],
  ['TOOL002', 'warning', 'dsh-tool', '工具输出必须是 schema 声明的规范值，render 只负责生成可持久化内容，错误不得伪装成成功文本。'],
  ['TST001', 'warning', 'testing', '项目必须有自动化测试，并覆盖 apply、effect disposer、错误配置和依赖缺失等关键路径。'],
  ['TST002', 'warning', 'testing', '测试应验证插件卸载后监听器、服务、定时器和子插件均被清理。'],
  ['SEC001', 'error', 'security', '源码和发布文件不得包含 API Key、令牌、私钥或密码等硬编码秘密。'],
  ['SEC002', 'error', 'security', '避免 eval/new Function、未约束 shell 执行、危险 HTML 注入及宽范围破坏性文件操作。'],
  ['SEC003', 'warning', 'security', '网络访问必须使用 HTTPS、超时、取消信号、响应大小限制，并避免泄漏敏感日志。'],
  ['SEC004', 'warning', 'security', 'install/preinstall/postinstall/prepare 脚本会在安装期执行代码，必须有明确必要性并接受审计。'],
  ['PERF001', 'warning', 'performance', 'apply 与事件监听器不得执行长时间同步 I/O、忙等或无界循环。'],
  ['PERF002', 'warning', 'performance', '高频定时器、无界缓存和未限制并发必须设置可配置上限与背压。'],
  ['PERF003', 'warning', 'performance', '性能门应测量重复 apply/dispose 的 p95 延迟和堆增长，并使用项目自定预算判定。'],
]

export const STANDARDS = Object.freeze(rules.map(([id, severity, category, requirement]) => Object.freeze({
  id,
  severity,
  category,
  requirement,
  source: id.startsWith('CRD')
    ? 'Cordis lifecycle, service, event, config, dependency and HMR contracts'
    : id.startsWith('DSH') || id.startsWith('TOOL')
      ? 'DeepSeek Harness plugin and bundle contracts'
      : 'General Node.js package quality baseline',
})))

export function getStandards() {
  return STANDARDS.map(rule => ({ ...rule }))
}

/**
 * @typedef {'error' | 'warning' | 'info'} StandardSeverity
 * @typedef {{ id: string, severity: StandardSeverity, category: string, requirement: string, source: string }} StandardRule
 */

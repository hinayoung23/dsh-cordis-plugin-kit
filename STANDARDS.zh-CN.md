# Cordis/DSH 插件离线规范

规范版本：`2026.08`

本文件是工具内置规则的人类可读说明。规则依据 DeepSeek Harness 插件基础教程、bundle 发布规范、Cordis 教程以及 Cordis `Context`、`Fiber`、`Service`、`RegistryService`、`EventsService` 源码契约整理。在线文档发生变化时，应升级规范版本、测试和对应规则，而不是悄悄改变既有检查语义。

## 1. 包与交付

- `PKG001`：有效的 ESM `package.json`、语义化版本和真实入口。
- `PKG002`：DSH bundle 声明 `dsh.bundle.patch`，且发布白名单包含入口与 patch。
- `PKG003`：本地入口不得越出项目目录，所有 manifest 文件引用必须存在。
- `PKG004`：声明 Node.js 22+、许可证、仓库、测试和检查脚本。
- `PKG005`：使用 `files` 白名单，排除本地环境、密钥和构建缓存。
- `DSH001`：patch 是 YAML 操作数组，插件行具有稳定、唯一的 `id` 与 `name`。
- `DSH002`：npm bundle 的模块名不得是本机绝对路径、相对源码路径或 URL。
- `DSH003`：`!!js` 只允许用于 `config`/`disabled`；patch 覆盖是整块替换而非深度合并。

## 2. Cordis 生命周期与依赖

- `CRD001`：入口采用函数、Service 类或 `{ apply }` 对象形态。
- `CRD002`：导出稳定 `name`，保证 Fiber 和日志可诊断。
- `CRD003`：必需服务必须声明 `inject`；可选服务使用 `ctx.get()`。
- `CRD004`：不得假设配置行顺序就是加载顺序，服务依赖才是启动约束。
- `CRD005`：Service 调用 `super(ctx, uniqueName)`，并声明合并 `Context` 类型。
- `CRD006`：Cordis 未管理的资源放入 `ctx.effect()`，返回同步或异步 disposer。
- `CRD007`：disposer 逆序启动但异步清理并发；有顺序依赖的步骤放在同一个 disposer 中串行等待。
- `CRD012`：顶层不得创建一次性副作用；插件需要支持 HMR 和依赖服务消失后的卸载/重载。
- `CRD013`：调试必须区分 `PENDING`、`FAILED`、`ACTIVE` 与清理完成，不能把静默等待当成加载成功。

## 3. 配置、服务与事件

- `CRD008`：`Config` 实现 Standard Schema；普通对象不会得到 Cordis 配置校验。
- `CRD009`：超时、端口、重试、并发和资源上限等部署差异进入 schema。
- `CRD010`：事件采用 `namespace/action` 并通过 `Events` 声明合并定义签名。
- `CRD011`：waterfall 是 around middleware；观察或包装必须 `next()`，不调用仅用于明确的有意短路。
- `CRD014`：只在独立演进确有必要时拆分 Definition/Provider/Consumer，Provider 与 Consumer 互不依赖。

## 4. DSH 工具

- `TOOL001`：工具插件 inject `tools`，并提供 parameters、output.schema、output.render 与 execute。
- `TOOL002`：execute 返回 schema 声明的规范值；render 生成可持久化内容，业务失败使用结构化错误。

## 5. 测试、安全与性能

- `TST001`：自动化测试覆盖 apply、错误配置、缺失依赖和失败路径。
- `TST002`：验证 dispose 后服务、监听器、定时器和子插件已清除。
- `SEC001`：不提交或发布令牌、API Key、密码、私钥和本地环境文件。
- `SEC002`：禁止动态代码执行、未约束 shell、HTML 注入和宽范围破坏性文件操作。
- `SEC003`：网络访问具备 HTTPS、超时、取消、响应上限和敏感信息脱敏。
- `SEC004`：安装期脚本属于供应链执行面，只有明确必要且经过审计时才能使用。
- `PERF001`：apply 和事件热路径避免同步 I/O、忙等和无界循环。
- `PERF002`：高频定时器、缓存和并发具备配置上限与背压。
- `PERF003`：重复 apply/dispose，按 p95 延迟和堆增长预算阻断回归。

## 6. 校验边界

静态规则采用保守模式，可能存在误报；动态 smoke/perf 使用测试替身，不能替代真实 provider 集成测试。涉及鉴权、资金、隐私、任意文件访问或进程执行的插件必须增加业务级威胁模型、权限测试和人工代码审查。

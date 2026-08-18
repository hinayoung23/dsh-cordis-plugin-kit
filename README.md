# DSH Cordis Plugin Kit

[中文](#中文) | [English](#english)

## 中文

面向 DeepSeek Harness/Cordis 插件开发的离线规范、脚手架与质量门工具。它把常用开发约定和 Cordis 特有的生命周期、依赖注入、服务、事件、配置及 HMR 规则固化为可执行检查，避免每次开发都重新查阅在线教程。

> 质量门可以发现已知模式和回归，但任何静态或动态工具都不能数学上保证代码绝无功能、性能或安全问题。高风险插件仍需要人工审查、真实依赖集成测试和针对业务的威胁建模。

当前规范基线：DeepSeek Harness `0.1.0-rc.7`、`@deepseek-ai/cordis` `4.0.1`。

### 功能

- 内置 33 条离线 Cordis/DSH/Node.js 规范，可按分类或 JSON 输出
- 生成可安装 DSH bundle、生命周期测试、质量预算和发布白名单
- 不执行代码的静态检查：manifest、bundle patch、inject、effect、Config、事件、工具契约、秘密和危险 API
- 使用项目原有包管理器执行测试，并提供超时与输出上限
- 在隔离子进程中使用目标项目的真实 Cordis 版本执行 `apply` / `dispose`
- 重复加载与卸载，测量 p50/p95 延迟及堆增长，按项目预算阻断交付
- 安装到 DSH 后提供 `ctx.cordisPluginKit` 只读规范/检查服务
- 零生产依赖

### 安装

作为开发工具安装：

```sh
pnpm add -D dsh-cordis-plugin-kit
```

作为 DSH bundle 安装：

```sh
dsh plugin --profile web add dsh-cordis-plugin-kit
```

### 快速开始

```sh
npx dsh-cordis-plugin-kit init ./my-cordis-plugin --name my-cordis-plugin
cd my-cordis-plugin
pnpm install
pnpm check
pnpm debug
pnpm perf
```

已有项目可以直接检查：

```sh
npx dsh-cordis-plugin-kit standards
npx dsh-cordis-plugin-kit check . --strict
npx dsh-cordis-plugin-kit test . --timeout 60000
npx dsh-cordis-plugin-kit debug . --provide tools,systemPrompt
npx dsh-cordis-plugin-kit perf . --iterations 50 --max-apply-ms 80
```

### 命令

#### `standards`

读取包内固化的规范，不访问网络：

```sh
dsh-cordis-kit standards --category lifecycle
dsh-cordis-kit standards --json
```

#### `check`

只读取目标项目，不导入或执行目标代码。默认 error 导致失败；`--strict` 会让 warning 也导致失败。

```sh
dsh-cordis-kit check . --strict
dsh-cordis-kit check . --json
```

#### `test`

静态质量门通过后，根据 `pnpm-lock.yaml`、`yarn.lock` 或 npm 选择项目现有包管理器执行测试。命令使用参数数组启动，不经过 shell。

#### `debug`

使用目标项目安装的 `@deepseek-ai/cordis` 在子进程中加载入口，执行一次完整 Fiber `apply → ACTIVE → dispose`。缺少 inject 服务时会显示 `PENDING`；可用 `--provide serviceA,serviceB` 提供惰性测试替身。

#### `perf`

从 `cordis-kit.json` 读取预算，重复创建和销毁 Fiber：

```json
{
  "entry": "./index.js",
  "config": {},
  "provide": [],
  "performance": {
    "iterations": 30,
    "maxApplyP95Ms": 50,
    "maxDisposeP95Ms": 50,
    "maxHeapGrowthKb": 1024
  }
}
```

运行时命令会执行目标插件代码，应只用于你信任的项目。子进程默认 30 秒超时，静态 `check` 则始终不执行代码。

### Cordis 专项质量门

- 必需服务通过 `inject` 声明；可选服务在使用处通过 `ctx.get()` 探测
- 定时器、连接、watcher、服务器、子进程等资源必须归属 `ctx.effect()` 并提供 disposer
- Service 使用唯一服务名并通过声明合并提供类型
- 事件采用 `namespace/action`；waterfall 观察者必须调用 `next()`
- `Config` 必须是 Standard Schema，部署可变参数不得硬编码
- bundle patch 使用稳定 `id`，模块名适合 npm 安装解析
- HMR、依赖消失和配置更新后不得残留监听器、服务或异步资源
- DSH 工具同时具备参数 schema、规范输出、render 和执行函数

完整规则见 [STANDARDS.zh-CN.md](./STANDARDS.zh-CN.md)。

### 开发验证

```sh
pnpm check
pnpm e2e
npm pack
```

### 许可证

MIT

## English

DSH Cordis Plugin Kit provides offline standards, scaffolding, and quality gates for DeepSeek Harness/Cordis plugin development. It turns general development conventions and Cordis-specific lifecycle, dependency injection, service, event, configuration, and HMR rules into executable checks, so developers do not need to revisit the online tutorials for every plugin.

> Quality gates can detect known patterns and regressions, but no static or dynamic tool can mathematically guarantee that code is free of functional, performance, or security issues. High-risk plugins still require manual review, integration tests with real dependencies, and application-specific threat modeling.

Current standards baseline: DeepSeek Harness `0.1.0-rc.7` and `@deepseek-ai/cordis` `4.0.1`.

### Features

- 33 built-in offline Cordis, DSH, and Node.js rules, with category filtering and JSON output
- Generate an installable DSH bundle, lifecycle tests, quality budgets, and a publishing allowlist
- Static checks that never execute target code: manifest, bundle patch, inject, effect, Config, events, tool contracts, secrets, and dangerous APIs
- Run tests with the project's existing package manager, with timeout and output limits
- Execute `apply` / `dispose` in an isolated child process using the target project's actual Cordis version
- Repeatedly load and unload plugins, measure p50/p95 latency and heap growth, and enforce project-level budgets
- Provide a read-only `ctx.cordisPluginKit` standards/checking service when installed in DSH
- Zero production dependencies

### Installation

Install as a development tool:

```sh
pnpm add -D dsh-cordis-plugin-kit
```

Install as a DSH bundle:

```sh
dsh plugin --profile web add dsh-cordis-plugin-kit
```

### Quick Start

```sh
npx dsh-cordis-plugin-kit init ./my-cordis-plugin --name my-cordis-plugin
cd my-cordis-plugin
pnpm install
pnpm check
pnpm debug
pnpm perf
```

Run the quality gates directly against an existing project:

```sh
npx dsh-cordis-plugin-kit standards
npx dsh-cordis-plugin-kit check . --strict
npx dsh-cordis-plugin-kit test . --timeout 60000
npx dsh-cordis-plugin-kit debug . --provide tools,systemPrompt
npx dsh-cordis-plugin-kit perf . --iterations 50 --max-apply-ms 80
```

### Commands

#### `standards`

Read the bundled standards without accessing the network:

```sh
dsh-cordis-kit standards --category lifecycle
dsh-cordis-kit standards --json
```

#### `check`

Read the target project without importing or executing its code. Errors fail the command by default; `--strict` also treats warnings as failures.

```sh
dsh-cordis-kit check . --strict
dsh-cordis-kit check . --json
```

#### `test`

After the static quality gate passes, select the project's existing package manager from `pnpm-lock.yaml`, `yarn.lock`, or npm and run its test suite. The command is launched with an argument array and never through a shell.

#### `debug`

Load the entry point in a child process with the target project's installed `@deepseek-ai/cordis`, then execute a complete Fiber `apply → ACTIVE → dispose` cycle. Missing injected services produce a `PENDING` state; use `--provide serviceA,serviceB` to supply lazy test stubs.

#### `perf`

Read budgets from `cordis-kit.json` and repeatedly create and dispose Fibers:

```json
{
  "entry": "./index.js",
  "config": {},
  "provide": [],
  "performance": {
    "iterations": 30,
    "maxApplyP95Ms": 50,
    "maxDisposeP95Ms": 50,
    "maxHeapGrowthKb": 1024
  }
}
```

Runtime commands execute target plugin code and should only be used with projects you trust. Child processes have a 30-second timeout by default; the static `check` command never executes target code.

### Cordis-Specific Quality Gates

- Declare required services through `inject`; probe optional services with `ctx.get()` at the point of use
- Own timers, connections, watchers, servers, child processes, and similar resources through `ctx.effect()` and return a disposer
- Give each Service a unique name and expose its types through declaration merging
- Use `namespace/action` event names; waterfall observers must call `next()`
- Define `Config` with Standard Schema and avoid hardcoding deployment-specific values
- Use a stable bundle patch `id` and a module name that npm installation can resolve
- Leave no listeners, services, or asynchronous resources behind after HMR, dependency removal, or configuration updates
- Define DSH tools with an argument schema, specification output, renderer, and execution function

See [STANDARDS.zh-CN.md](./STANDARDS.zh-CN.md) for the complete rule set (currently available in Chinese).

### Development Verification

```sh
pnpm check
pnpm e2e
npm pack
```

### License

MIT

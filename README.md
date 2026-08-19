# DSH Cordis Plugin Kit

[中文](#中文) | [English](#english)

## 中文

面向 DeepSeek Harness/Cordis 插件开发的离线规范、脚手架与质量门工具。它把常用开发约定和 Cordis 特有的生命周期、依赖注入、服务、事件、配置及 HMR 规则固化为可执行检查，避免每次开发都重新查阅在线教程。

> 质量门可以发现已知模式和回归，但任何静态或动态工具都不能数学上保证代码绝无功能、性能或安全问题。高风险插件仍需要人工审查、真实依赖集成测试和针对业务的威胁建模。

当前规范基线：DeepSeek Harness `0.1.0-rc.7`、`@deepseek-ai/cordis` `4.0.1`。

### 功能

- 内置 35 条离线 Cordis/DSH/Node.js/自动化规范，可按分类或 JSON 输出
- 生成可安装 DSH bundle、生命周期测试、质量预算、Git hooks、代理指令和 CI 适配文件
- 不执行代码的静态检查：manifest、bundle patch、inject、effect、Config、事件、工具契约、秘密和危险 API
- 使用项目原有包管理器执行测试，并提供超时与输出上限
- 在隔离子进程中使用目标项目的真实 Cordis 版本执行 `apply` / `dispose`
- 重复加载与卸载，测量 p50/p95 延迟及堆增长，按项目预算阻断交付
- 保存时执行防抖快速检查，提交/推送/打包时自动升级质量门；开发监听器只随 `pnpm dev` 运行，不安装系统常驻进程
- 统一 `ci` 核心兼容 GitHub、GitLab、Gitee 及任意可运行 Node.js 的流水线
- 安装到 DSH 后提供 `ctx.cordisPluginKit` 规范、静态检查和显式质量门服务
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
npx dsh-cordis-plugin-kit init ./my-cordis-plugin --name my-cordis-plugin --ci auto
cd my-cordis-plugin
pnpm install
pnpm check
pnpm dev
```

`init` 默认使用 `balanced` 自动化模式：创建本地 Git 仓库，配置版本库级 `core.hooksPath=.githooks`，生成 `AGENTS.md`，并根据 Git remote、现有流水线或 `package.json.repository` 选择 CI。不会修改全局 Git 配置。目标已设置其他 `hooksPath` 或已有 CI 文件时会保留原内容并给出合并提示。

### 自动工作流

| 关键节点 | 触发方式 | 检查内容 |
| --- | --- | --- |
| 保存 | `pnpm dev` 文件监听，或 DSH/Codex 按 `AGENTS.md` 调用 | 静态、Cordis 规则、安全模式 |
| 提交 | Git `pre-commit` hook | 严格静态检查、单元测试 |
| 推送 | Git `pre-push` hook | 严格检查、测试、真实 Cordis apply/dispose |
| 打包 | npm/pnpm `prepack` | 完整运行时与性能门；避免递归打包 |
| push / PR / MR | 托管平台流水线 | 测试、运行时、性能、安全和包内容复核 |

检查结果统一写入 `.cordis-kit/reports/`：`result.json`、`junit.xml`、`security.sarif` 和 `summary.md`。失败时所有平台使用同一个非零退出码语义。

监听器不是后台服务。它只在显式运行 `pnpm dev` / `dsh-cordis-kit watch .` 时存在，退出终端即停止。即使未启动监听器，Git hooks 和远端 CI 仍是不可绕过的后续质量门。

已有项目可以直接检查：

```sh
npx dsh-cordis-plugin-kit standards
npx dsh-cordis-plugin-kit check . --strict
npx dsh-cordis-plugin-kit test . --timeout 60000
npx dsh-cordis-plugin-kit debug . --provide tools,systemPrompt
npx dsh-cordis-plugin-kit perf . --iterations 50 --max-apply-ms 80
npx dsh-cordis-plugin-kit checkpoint pre-push .
npx dsh-cordis-plugin-kit ci .
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

#### `checkpoint`、`watch` 与 `ci`

```sh
dsh-cordis-kit checkpoint save .
dsh-cordis-kit checkpoint pre-commit .
dsh-cordis-kit checkpoint pre-push .
dsh-cordis-kit checkpoint release .
dsh-cordis-kit watch . --debounce 800
dsh-cordis-kit ci .
```

`checkpoint` 按关键节点逐级增加检查；`watch` 对源码和 Cordis/DSH 配置保存进行防抖检查并忽略依赖、构建产物和自身报告；`ci` 始终执行平台无关的完整质量门。

为已有项目生成或补充托管平台适配：

```sh
dsh-cordis-kit automation setup . --ci auto
dsh-cordis-kit ci setup . --provider auto
dsh-cordis-kit ci setup . --provider github
dsh-cordis-kit ci setup . --provider gitlab,gitee
dsh-cordis-kit ci setup . --provider all
```

- GitHub：`.github/workflows/cordis-quality.yml`
- GitLab：`.gitlab-ci.yml`；若已存在则生成 `.cordis-kit/ci/gitlab.include.yml`，不覆盖用户文件
- Gitee Go：`.workflow/MasterPipeline.yml`、`BranchPipeline.yml`、`PRPipeline.yml`；仓库需先在网页端开通一次 Gitee Go
- 通用 CI：`.cordis-kit/ci/README.md` 中的三条平台无关命令，可用于 Jenkins、Buildkite、Drone、Woodpecker、Azure Pipelines 或企业内部系统

这些适配不需要平台 API Token；只需流水线具备检出代码、Node.js 22+ 和安装依赖的能力。私有 npm 源或私有依赖仍按企业原有凭据管理方式配置。
生成器会依据 lockfile 和 `packageManager` 自动选择 pnpm、Yarn 或 npm 的安装/执行命令；质量判定仍由同一个核心完成。

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

- 35 built-in offline Cordis, DSH, Node.js, and automation rules, with category filtering and JSON output
- Generate an installable DSH bundle, lifecycle tests, quality budgets, Git hooks, agent instructions, and CI adapters
- Static checks that never execute target code: manifest, bundle patch, inject, effect, Config, events, tool contracts, secrets, and dangerous APIs
- Run tests with the project's existing package manager, with timeout and output limits
- Execute `apply` / `dispose` in an isolated child process using the target project's actual Cordis version
- Repeatedly load and unload plugins, measure p50/p95 latency and heap growth, and enforce project-level budgets
- Run debounced checks on save and progressively stronger gates on commit, push, and package; the watcher only lives while `pnpm dev` is running
- Use one platform-neutral `ci` core on GitHub, GitLab, Gitee, and any Node.js-capable runner
- Provide standards, static checks, and explicit quality gates through `ctx.cordisPluginKit` when installed in DSH
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
npx dsh-cordis-plugin-kit init ./my-cordis-plugin --name my-cordis-plugin --ci auto
cd my-cordis-plugin
pnpm install
pnpm check
pnpm dev
```

By default, `init` uses balanced automation: it creates a local Git repository, configures repository-local `core.hooksPath=.githooks`, writes `AGENTS.md`, and selects a CI adapter from Git remotes, existing pipeline files, or `package.json.repository`. It never changes global Git configuration. Existing hooks paths and CI files are preserved and reported for manual merging.

### Automated Workflow

| Checkpoint | Trigger | Gate |
| --- | --- | --- |
| Save | `pnpm dev`, or DSH/Codex following `AGENTS.md` | Static, Cordis rules, security patterns |
| Commit | Git `pre-commit` hook | Strict static checks and unit tests |
| Push | Git `pre-push` hook | Strict checks, tests, real Cordis apply/dispose |
| Package | npm/pnpm `prepack` | Full runtime and performance gate without recursive packing |
| Push / PR / MR | Hosted CI pipeline | Tests, runtime, performance, security, and package review |

Every platform receives the same reports in `.cordis-kit/reports/`: `result.json`, `junit.xml`, `security.sarif`, and `summary.md`, with consistent non-zero failure semantics.

The watcher is not a daemon. It only runs while `pnpm dev` or `dsh-cordis-kit watch .` is active. Git hooks and remote CI remain as later enforcement layers when no watcher is running.

Run the quality gates directly against an existing project:

```sh
npx dsh-cordis-plugin-kit standards
npx dsh-cordis-plugin-kit check . --strict
npx dsh-cordis-plugin-kit test . --timeout 60000
npx dsh-cordis-plugin-kit debug . --provide tools,systemPrompt
npx dsh-cordis-plugin-kit perf . --iterations 50 --max-apply-ms 80
npx dsh-cordis-plugin-kit checkpoint pre-push .
npx dsh-cordis-plugin-kit ci .
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

#### `checkpoint`, `watch`, and `ci`

```sh
dsh-cordis-kit checkpoint save .
dsh-cordis-kit checkpoint pre-commit .
dsh-cordis-kit checkpoint pre-push .
dsh-cordis-kit checkpoint release .
dsh-cordis-kit watch . --debounce 800
dsh-cordis-kit ci .
```

`checkpoint` adds progressively stronger gates at development milestones. `watch` debounces source and Cordis/DSH configuration saves while ignoring dependencies, build output, and its own reports. `ci` always executes the full platform-neutral gate.

Generate adapters for an existing repository:

```sh
dsh-cordis-kit automation setup . --ci auto
dsh-cordis-kit ci setup . --provider auto
dsh-cordis-kit ci setup . --provider github
dsh-cordis-kit ci setup . --provider gitlab,gitee
dsh-cordis-kit ci setup . --provider all
```

- GitHub: `.github/workflows/cordis-quality.yml`
- GitLab: `.gitlab-ci.yml`; if it already exists, the tool writes `.cordis-kit/ci/gitlab.include.yml` without overwriting user content
- Gitee Go: `.workflow/MasterPipeline.yml`, `BranchPipeline.yml`, and `PRPipeline.yml`; enable Gitee Go once in the repository UI
- Generic CI: three portable commands in `.cordis-kit/ci/README.md` for Jenkins, Buildkite, Drone, Woodpecker, Azure Pipelines, or internal systems

No platform API token is required for these quality adapters. The runner only needs a checkout, Node.js 22+, and dependency installation. Private registries and private dependencies continue to use the organization's existing credential mechanism.
The generator selects pnpm, Yarn, or npm commands from the lockfile and `packageManager`; every adapter still delegates pass/fail semantics to the same core.

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

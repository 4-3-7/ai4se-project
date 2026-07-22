# Seahorse — Coding Agent Harness

> **Agent = LLM + Harness**
>
> LLM 相当于 CPU，只负责"决定下一步做什么"这一行任务决策；其余都是工程。Seahorse 把一只只会产生下一步设想的 LLM，封装成一台能稳定、可靠工作的 coding agent 系统。

[![CI](https://github.com/4-3-7/ai4se-project/actions/workflows/ci.yml/badge.svg)](https://github.com/4-3-7/ai4se-project/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/badge/node-%E2%89%A522.0.0-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-green)](./LICENSE)

---

## 目录

- [项目简介](#项目简介)
- [核心能力](#核心能力)
- [快速开始](#快速开始)
- [安装与分发](#安装与分发)
- [CLI 命令](#cli-命令)
- [API Key 安全配置](#api-key-安全配置)
- [项目结构](#项目结构)
- [开发指南](#开发指南)
- [架构概览](#架构概览)
- [安全边界说明](#安全边界说明)
- [已知限制](#已知限制)
- [许可证](#许可证)

---

## 项目简介

Seahorse 是一个面向软件开发场景的 **Coding Agent Harness**。它将 LLM 的"思考"能力与工程化的治理、反馈、记忆、配置机制结合起来，形成一个可测试、可审计、可信任的 agent 运行时。

### 核心理念：Agent = LLM + Harness

| 层 | 职责 | 由谁完成 |
|----|------|---------|
| **LLM** | 决定下一步做什么（任务决策） | Claude / GPT 等大模型 |
| **Harness** | 决策封装、工具分发、安全治理、反馈闭环、记忆管理、配置注入 | Seahorse（你的代码） |

### 为什么需要 Harness？

一个仅会生成文本的 LLM 无法可靠地完成编码任务——它不知道何时停止、无法自我验证、可能执行危险操作、不记得上次的约定。Harness 这层工程封装正是解决这些问题的关键。

---

## 核心能力

### 🛡️ 治理系统（主攻维度）

- **13 种危险模式自动检测**：`rm -rf /`、`DROP TABLE`、`curl | bash`、fork bomb、`chmod 777` 等
- **四级护栏拦截**：白名单 → 模式匹配 → 路径边界 → 语义分析
- **HITL 状态机**：检测到危险动作时暂停，等待人工审批（Allow/Deny/Terminate）
- **沙箱路径围栏**：限制 agent 的文件系统访问范围
- **JSONL 审计日志**：完整记录每次工具执行、护栏判定、HITL 事件，自动脱敏 API Key

### 🔄 反馈闭环（辅助维度）

- **测试/Lint 结果解析器**：支持 Vitest、Jest、Mocha、ESLint
- **8 类失败分类器**：语法错误、类型错误、导入错误、逻辑错误、风格错误、运行时错误、超时、未知
- **Markdown 反馈报告回灌**：分类结果格式化后注入下一轮 LLM 上下文，驱动自我修正

### 🧠 记忆系统

- 基于文件系统的 Markdown 记忆存储（含 frontmatter 元数据）
- 关键词检索 + 相关性排序
- 支持跨会话项目约定、历史决策、用户偏好持久化

### ⚙️ 工程特性

- **双 LLM 供应商**：Anthropic Claude + OpenAI GPT（原生 fetch，不依赖 agent 框架）
- **Mock LLM 抽象层**：100% 确定性单元测试，无需网络、无需 API Key
- **xterm.js Web UI**：WebSocket 实时通信的 Web 终端
- **Docker 多阶段构建**：`node:22-alpine` 基础镜像，非 root 用户运行
- **npm 包分发**：`npm install -g seahorse` 一键安装
- **GitHub Actions CI**：lint → typecheck → test → build → docker 全自动

---

## 快速开始

### 前提条件

- [Node.js](https://nodejs.org/) ≥ 22.0.0
- 一个 LLM 供应商的 API Key（Anthropic 或 OpenAI）

### 安装

```bash
npm install -g seahorse
```

### 配置 API Key

```bash
# 交互式引导（隐藏输入，安全存储到系统 Keychain）
seahorse setup

# 查看配置状态（不显示明文）
seahorse status
```

### 运行

```bash
# 下达编码任务
seahorse run "修复 src/parser.ts 中的类型错误"

# 启动 Web 终端
seahorse web

# 运行机制演示
seahorse demo
```

---

## 安装与分发

### 方式一：npm 全局安装（推荐）

```bash
npm install -g seahorse
seahorse --help
```

**目标平台**：macOS、Linux、Windows（需 Node.js 22+）

### 方式二：Docker 镜像

```bash
# 构建镜像
docker build -t seahorse .

# 运行（挂载项目目录，传递 API Key）
docker run -it --rm \
  -v $(pwd):/workspace \
  -v ~/.seahorse:/home/seahorse/.seahorse \
  -e ANTHROPIC_API_KEY \
  seahorse run "列出当前项目的所有 TypeScript 类型错误"

# 启动 Web UI
docker run -it --rm -p 3000:3000 \
  -v $(pwd):/workspace \
  -e ANTHROPIC_API_KEY \
  seahorse web
```

**Docker 镜像详情**：
- 基础镜像：`node:22-alpine`
- 多阶段构建（builder + runtime）
- 以非 root 用户 `seahorse` 运行
- 挂载卷：`/workspace`（项目目录）、`/home/seahorse/.seahorse`（配置与记忆）

### 方式三：从源码构建

```bash
git clone https://github.com/4-3-7/ai4se-project.git
cd ai4se-project
npm install
npm run build
npm link          # 将 seahorse 链接到全局 PATH
```

---

## CLI 命令

| 命令 | 说明 |
|------|------|
| `seahorse run <task>` | 启动 coding agent 执行任务 |
| `seahorse setup` | 交互式配置 API Key（安全存储到系统 Keychain） |
| `seahorse status` | 查看当前配置状态（不显示 Key 明文） |
| `seahorse config` | 显示当前完整配置 |
| `seahorse web` | 启动 Web 终端（xterm.js + WebSocket） |
| `seahorse demo` | 运行机制演示（护栏拦截 + 反馈闭环 + 治理深入） |
| `seahorse clear` | 清除所有存储的凭证 |

### 常用选项

```bash
# 详细输出（显示完整上下文）
seahorse run "修复 bug" --verbose

# 结构化 JSON 日志输出
seahorse run "修复 bug" --json

# 指定 LLM 模型
seahorse run "修复 bug" --model claude-sonnet-5

# 指定最大循环轮次
seahorse run "修复 bug" --max-turns 30
```

---

## API Key 安全配置

### 安全存储方案

Seahorse 采用**分层存储策略**，优先使用系统原生安全机制：

| 优先级 | 方案 | 安全性 | 适用场景 |
|--------|------|--------|---------|
| 1（主方案） | 系统 Keychain（keytar） | ⭐⭐⭐ 高 | macOS Keychain / Windows Credential Manager / Linux Secret Service |
| 2（降级） | AES-256-GCM 加密文件 | ⭐⭐ 中 | 无桌面环境的 Linux 服务器 |
| 3（fallback） | `.env` 文件 / 环境变量 | ⭐ 低（明文明文） | 开发测试环境，使用时打印风险提示 |

### 首次配置

```bash
seahorse setup
```

交互式引导流程：
1. 选择 LLM 供应商（Anthropic / OpenAI / 两者）
2. 输入 API Key（隐藏回显，密码星号）
3. 自动验证 Key 有效性（发送最小 API 请求）
4. 验证通过后存入系统 Keychain
5. 验证失败则提示重新输入（最多 3 次）

### 查看与管理

```bash
seahorse status     # 显示已配置的供应商和 Key 状态（不暴露明文）
seahorse clear      # 清除所有存储的凭证
```

### 安全原则

- ❌ **绝不**硬编码 Key 到源代码
- ❌ **绝不**提交 Key 到 Git（含历史记录）
- ❌ **绝不**写入日志或终端 history
- ❌ **绝不**通过命令行 `export` 传递
- ✅ 内存中的 Key 变量使用后立即解除引用
- ✅ 错误消息中只显示 Key 的前 4 位 + 后 4 位
- ✅ 审计日志自动脱敏所有 Key 相关内容

### Docker 环境中的 Key 配置

```bash
# 方式一：环境变量传递
docker run -e ANTHROPIC_API_KEY=sk-ant-... seahorse run "..."

# 方式二：挂载 .seahorse 配置目录
docker run -v ~/.seahorse:/home/seahorse/.seahorse seahorse run "..."
```

---

## 项目结构

```
seahorse/
├── src/
│   ├── core/                        # 核心引擎
│   │   ├── agent-loop.ts            # 主循环（上下文→LLM→解析→执行→回灌→停机）
│   │   ├── agent-loop.test.ts
│   │   ├── action-parser.ts         # 动作解析器（LLM 输出→结构化动作）
│   │   ├── action-parser.test.ts
│   │   ├── stop-judge.ts            # 停机判断器
│   │   ├── stop-judge.test.ts
│   │   └── llm/                     # LLM 抽象层
│   │       ├── types.ts             # 类型定义（Message, ToolCall, LLMProvider, MockScript）
│   │       ├── provider.ts          # Provider 工厂函数
│   │       ├── mock.ts              # Mock LLM（确定性脚本匹配）
│   │       ├── mock.test.ts
│   │       ├── anthropic.ts         # Anthropic Claude 适配器
│   │       ├── anthropic.test.ts
│   │       ├── openai.ts            # OpenAI GPT 适配器
│   │       └── openai.test.ts
│   ├── tools/                       # 工具系统
│   │   ├── types.ts                 # Tool, ToolResult 类型定义
│   │   ├── registry.ts             # 工具注册表
│   │   ├── registry.test.ts
│   │   ├── file-tools.ts            # 文件读写编辑工具
│   │   ├── file-tools.test.ts
│   │   ├── shell-exec.ts            # Shell 命令执行工具
│   │   ├── shell-exec.test.ts
│   │   ├── test-runner.ts           # 测试运行器 + Lint 工具
│   │   └── test-runner.test.ts
│   ├── governance/                  # 治理系统（★ 主攻维度）
│   │   ├── guardrail.ts             # 护栏引擎（四级拦截）
│   │   ├── guardrail.test.ts
│   │   ├── danger-patterns.ts       # 13 种危险模式定义
│   │   ├── sandbox.ts               # 沙箱/路径围栏
│   │   ├── sandbox.test.ts
│   │   ├── hitl-state-machine.ts    # HITL 暂停审批状态机
│   │   ├── hitl-state-machine.test.ts
│   │   ├── audit-log.ts             # JSONL 审计日志
│   │   └── audit-log.test.ts
│   ├── feedback/                    # 反馈闭环（辅助维度）
│   │   ├── feedback-parsers.ts      # 测试结果 + Lint 输出解析器
│   │   ├── feedback-parsers.test.ts
│   │   ├── failure-classifier.ts    # 8 类失败分类器
│   │   ├── failure-classifier.test.ts
│   │   ├── feedback-injector.ts     # 反馈回灌器（Markdown 报告）
│   │   └── feedback-injector.test.ts
│   ├── memory/                      # 记忆系统
│   │   ├── types.ts                 # 记忆类型定义
│   │   ├── file-store.ts            # 文件系统记忆存储
│   │   ├── file-store.test.ts
│   │   ├── retriever.ts             # 关键词检索器
│   │   └── retriever.test.ts
│   ├── config/                      # 配置系统
│   │   ├── loader.ts                # YAML/JSON 配置加载器
│   │   └── loader.test.ts
│   ├── credentials/                 # 凭证安全
│   │   ├── manager.ts               # AES-256-GCM 加密存储 + 凭证管理
│   │   └── manager.test.ts
│   ├── cli/
│   │   └── main.ts                  # CLI 入口（Commander.js，7 个命令）
│   ├── web/
│   │   ├── server.ts                # WebSocket 服务器
│   │   └── public/
│   │       └── index.html           # xterm.js 终端前端
│   └── index.ts                     # 公共 API 导出
├── demo/                            # 机制演示
│   ├── run-all.ts                   # 演示入口
│   ├── guardrail-demo.ts            # 演示①：护栏拦截危险动作
│   ├── feedback-demo.ts             # 演示②：反馈闭环驱动修正
│   └── governance-demo.ts           # 演示③：治理深入行为
├── .github/workflows/
│   └── ci.yml                       # GitHub Actions CI（lint → typecheck → test → build → docker）
├── Dockerfile                       # 多阶段 Docker 构建
├── package.json                     # npm 包配置
├── tsconfig.json                    # TypeScript 配置
├── vitest.config.ts                 # Vitest 测试配置
├── SPEC.md                          # 设计文档
├── PLAN.md                          # 实现计划（27 个任务）
├── SPEC_PROCESS.md                  # 规约与计划过程文档
├── AGENT_LOG.md                     # 开发日志
├── REFLECTION.md                    # 反思报告
└── README.md                        # 本文件
```

---

## 开发指南

### 环境准备

```bash
# 克隆仓库
git clone https://github.com/4-3-7/ai4se-project.git
cd ai4se-project

# 安装依赖
npm install

# 编译
npm run build
```

### 常用命令

| 命令 | 说明 |
|------|------|
| `npm test` | 运行全部单元测试（233 个，全部通过 Mock LLM，无需网络） |
| `npm run test:watch` | 监听模式运行测试 |
| `npm run lint` | ESLint 代码检查 |
| `npm run lint:fix` | ESLint 自动修复 |
| `npm run typecheck` | TypeScript 类型检查（`tsc --noEmit`） |
| `npm run format` | Prettier 格式化 |
| `npm run build` | 编译 TypeScript → `dist/` |
| `npm run demo` | 运行 3 个机制演示 |

### 技术栈

| 维度 | 选择 | 理由 |
|------|------|------|
| 语言 | TypeScript 5.x | 类型安全，适合 harness 这种需要精确控制的系统 |
| 运行时 | Node.js 22 LTS | 长期支持，跨平台，对文件系统/shell/HTTP 操作成熟 |
| 测试框架 | Vitest | 快速，原生 ESM 支持，与 TypeScript 零配置集成 |
| CLI 框架 | Commander.js | 成熟稳定，声明式命令定义 |
| 配置解析 | js-yaml | YAML 可读性优于 JSON，适合配置文件 |
| 凭证存储 | AES-256-GCM 加密文件 | 跨平台，不依赖系统 Keychain 原生库 |
| 代码规范 | ESLint + Prettier | 标准 TypeScript 工具链 |

### Mock LLM 测试

项目核心设计要求所有机制在移除真实 LLM 后仍能被确定性单元测试验证。Seahorse 通过 `MockLLMProvider` 实现这一点：

```typescript
import { MockLLMProvider } from './core/llm/mock.js';

const mock = new MockLLMProvider([
  {
    match: (msgs) => msgs.some(m => m.content.includes('运行测试')),
    response: {
      content: '',
      toolCalls: [{ id: '1', name: 'run_tests', arguments: {} }],
      usage: { input: 100, output: 50 },
      finishReason: 'tool_calls',
    },
  },
]);
```

所有 233 个测试用例均使用 Mock LLM，无需网络、无需 API Key、100% 确定性通过。

---

## 架构概览

```
                        ┌──────────────┐
                        │   CLI / Web   │
                        │  用户输入任务  │
                        └──────┬───────┘
                               │
               ┌───────────────▼───────────────┐
               │       Agent 主循环             │
               │                               │
               │  上下文组装 → LLM → 动作解析    │
               │    ↑                    ↓      │
               │    │          ┌─────────┐     │
               │    │          │ 治理系统 │     │
               │    │          │ ┌─────┐ │     │
               │    │          │ │护栏  │ │     │
               │    │          │ └──┬──┘ │     │
               │    │          │ ┌──▼──┐ │     │
               │    │          │ │HITL  │ │     │
               │    │          │ └──┬──┘ │     │
               │    │          │ ┌──▼──┐ │     │
               │    │          │ │沙箱  │ │     │
               │    │          │ └──┬──┘ │     │
               │    │          └───┼────┘     │
               │    │              ↓          │
               │    │         ┌─────────┐     │
               │    │         │ 工具执行 │     │
               │    │         └────┬────┘     │
               │    │              ↓          │
               │    │   ┌─────────────────┐   │
               │    │   │   反馈系统       │   │
               │    │   │ 校验→分类→回灌   │   │
               │    └───┴─────────────────┘   │
               │              ↓               │
               │         ┌─────────┐          │
               │         │ 停机判断 │          │
               │         └────┬────┘          │
               └──────────────┼──────────────┘
                              ↓
                       ┌──────────────┐
                       │   审计日志    │
                       │  (JSONL)     │
                       └──────────────┘
```

### 核心循环

```
1. 加载系统提示词 + 记忆 + 配置规则 → 组装上下文
2. 调用 LLM Provider，获取响应
3. 解析响应中的动作（工具调用 or 文本回复）
4. 若为工具调用：
   a. 送入治理护栏检查 → 放行 or 拦截
   b. 若被拦截 → 进入 HITL 状态机，等待人工审批
   c. 若放行 → 分发到对应工具执行
   d. 获取执行结果，送入反馈校验器
   e. 将结果 + 分类反馈回灌到上下文，回到步骤 2
5. 若为文本回复且无工具调用 → 停机判断
6. 所有事件记录到审计日志
```

---

## 安全边界说明

### 护栏覆盖的危险操作

| 危险等级 | 类别 | 示例 | 处理方式 |
|---------|------|------|---------|
| 🔴 Critical | 文件系统破坏 | `rm -rf /`, `dd`, `mkfs` | 硬拦截 + HITL 审批 |
| 🔴 Critical | 数据库破坏 | `DROP TABLE`, `DELETE FROM ...` | 硬拦截 + HITL 审批 |
| 🟠 High | 权限变更 | `chmod 777`, `chown root` | 硬拦截 + HITL 审批 |
| 🟠 High | 敏感文件访问 | `/etc/passwd`, `~/.ssh`, `~/.aws` | 硬拦截（沙箱） |
| 🟡 Medium | 外部发布 | `git push --force`, `npm publish` | 可配置拦截 |
| 🟡 Medium | 网络外传 | `curl -X POST` 发送敏感文件 | 硬拦截 + HITL 审批 |
| 🟢 Low | 正常操作 | 项目目录内文件读写 | 放行 |

### 沙箱路径边界

- 默认仅允许访问项目工作目录（`cwd`）
- 禁止访问系统敏感路径：`/etc`、`/System`、`~/.ssh`、`~/.aws`
- 可通过 `seahorse.config.yaml` 自定义允许/禁止路径

### 审计日志

- 格式：JSONL（每行一条 JSON 记录）
- 存储位置：`~/.seahorse/audit/`
- 记录内容：每次工具执行、护栏判定、HITL 决策、执行结果
- 自动脱敏：API Key 相关内容不会出现在日志中

---

## 已知限制

### 平台与架构

| 平台 | 状态 | 说明 |
|------|------|------|
| macOS (arm64/x64) | ✅ 完全支持 | 所有功能正常工作 |
| Linux (x64) | ✅ 完全支持 | 所有功能正常工作 |
| Windows (x64) | ✅ 基本支持 | CLI 功能正常；凭证存储使用 AES-256-GCM 加密文件（不依赖 Windows Credential Manager） |

### 依赖前提

- **Node.js ≥ 22.0.0**：项目使用 ESM 模块和 Node.js 22 特性
- **npm ≥ 9.0.0**：用于安装和构建
- **API Key**：需要 Anthropic 或 OpenAI 的 API Key 才能使用真实 LLM 功能（Mock LLM 模式无需 Key）

### 功能限制

- **单 Agent 模式**：当前版本不支持多 Agent 协作编排
- **非流式输出**：LLM 响应为完整返回，非 streaming 模式（计划后续版本支持）
- **工具集为内置**：暂不支持第三方插件扩展工具系统
- **记忆检索为关键词匹配**：基于 TF-IDF 的关键词检索，非向量语义检索（符合项目"自实现"要求，不依赖向量数据库）
- **Web UI 为终端模拟**：基于 xterm.js + WebSocket 的 Web 终端，非完整 IDE 界面

### 安全边界

- **护栏基于模式匹配**：危险命令检测基于正则表达式，可能存在绕过。建议配合沙箱路径围栏和命令白名单使用。
- **HITL 默认超时 300s**：在无人值守的自动化场景中需注意超时后的自动 Deny 行为。
- **凭证存储依赖文件系统权限**：AES-256-GCM 加密文件的密钥由机器唯一标识派生，不提供跨设备同步。

---

## 许可证

[MIT](./LICENSE)

---

## 相关文档

| 文档 | 说明 |
|------|------|
| [SPEC.md](./SPEC.md) | 完整设计文档（问题陈述、用户故事、功能规约、系统架构、数据模型、机制设计） |
| [PLAN.md](./PLAN.md) | 实现计划（27 个任务，全部完成） |
| [SPEC_PROCESS.md](./SPEC_PROCESS.md) | 规约与计划过程文档（brainstorming 关键节点、冷启动验证） |
| [AGENT_LOG.md](./AGENT_LOG.md) | 开发日志（subagent 工作记录、人工干预、经验教训） |
| [REFLECTION.md](./REFLECTION.md) | 反思报告（1500-2500 字，对方法论和工具链的批判性思考） |

---

> **Seahorse** — 用 harness 造 harness，对"Agent = LLM + Harness"这一方法论的第一手批判性实践。
>
> 🤖 本项目由 Claude Code（Superpowers 框架）辅助开发，所有核心机制代码由人工设计、审查并负责。